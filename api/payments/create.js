import { randomUUID } from 'node:crypto';
import { getDb } from '../_lib/db.js';
import { readJsonBody, requireTrustedOrigin, sendJson } from '../_lib/http.js';
import { createXenditPaymentRequest } from '../_lib/xendit.js';
import { clientKey, createRateLimiter } from '../../src/lib/requestSecurity.js';

function normalizePhone(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
}

const paymentCreationLimiter = createRateLimiter({ limit: 8, windowMs: 60_000 });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }
  if (!requireTrustedOrigin(req, res)) return;
  const limit = paymentCreationLimiter.check(clientKey(req));
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(limit.retryAfterMs / 1000)));
    return sendJson(res, 429, { error: 'Terlalu banyak permintaan pembayaran. Coba lagi sebentar.' });
  }

  const secretKey = process.env.XENDIT_SECRET_KEY;
  if (!secretKey) {
    return sendJson(res, 503, { error: 'Pembayaran QRIS belum dikonfigurasi.' });
  }

  const body = await readJsonBody(req);
  const productId = typeof body?.productId === 'string' ? body.productId.trim() : '';
  const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : '';
  const customerWA = normalizePhone(body?.customerWA);
  if (
    !productId ||
    productId.length > 100 ||
    !customerName ||
    customerName.length > 100 ||
    !/^\d{8,16}$/.test(customerWA)
  ) {
    return sendJson(res, 400, { error: 'Data produk, nama, atau nomor WhatsApp tidak valid.' });
  }

  try {
    const db = await getDb();
    const product = await db.collection('products').findOne({ _id: productId });
    if (!product) return sendJson(res, 404, { error: 'Produk tidak ditemukan.' });
    if (!Number.isSafeInteger(product.price) || product.price <= 0) {
      return sendJson(res, 409, { error: 'Harga produk tidak valid. Hubungi admin toko.' });
    }
    if (Number.isSafeInteger(product.stock) && product.stock <= 0) {
      return sendJson(res, 409, { error: 'Stok produk habis.' });
    }

    const referenceId = randomUUID();
    const invoiceCode = `INV-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const order = {
      _id: referenceId,
      referenceId,
      invoiceCode,
      productId,
      productTitle: product.title,
      customerName,
      customerWA,
      amount: product.price,
      currency: 'IDR',
      status: 'creating',
      createdAt: new Date(),
    };
    const orders = db.collection('payments');
    await orders.insertOne(order);

    try {
      const payment = await createXenditPaymentRequest(order, secretKey);
      await orders.updateOne(
        { _id: referenceId, status: 'creating' },
        {
          $set: {
            status: 'pending',
            paymentRequestId: payment.paymentRequestId,
            qrCode: payment.qrCode,
            providerStatus: payment.providerStatus,
            expiresAt: payment.expiresAt,
            updatedAt: new Date(),
          },
        },
      );
      return sendJson(res, 201, {
        invoice: {
          code: invoiceCode,
          productTitle: product.title,
          amount: product.price,
          status: 'pending',
          qrCode: payment.qrCode,
          expiresAt: payment.expiresAt,
        },
      });
    } catch (error) {
      await orders.updateOne(
        { _id: referenceId, status: 'creating' },
        { $set: { status: 'review', errorCode: 'payment_request_failed', updatedAt: new Date() } },
      );
      console.error('payments/create: gagal membuat Payment Request Xendit', error);
      return sendJson(res, 502, { error: 'QRIS gagal dibuat. Silakan coba lagi atau hubungi admin.' });
    }
  } catch (error) {
    console.error('payments/create: gagal menyimpan pesanan', error);
    return sendJson(res, 503, { error: 'Pesanan gagal disimpan. Coba lagi.' });
  }
}
