import { getDb } from '../_lib/db.js';
import { readJsonBody, requireTrustedOrigin, sendJson } from '../_lib/http.js';
import { normalizeInvoiceCode } from '../../src/lib/paymentValidation.js';

function publicPayment(order) {
  return {
    code: order.invoiceCode,
    productTitle: order.productTitle,
    amount: order.amount,
    status: order.status,
    date: order.createdAt,
    expiresAt: order.expiresAt || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }
  if (!requireTrustedOrigin(req, res)) return;

  const body = await readJsonBody(req);
  const invoiceCode = normalizeInvoiceCode(body?.code);
  if (!/^INV-[A-F0-9]{16}$/.test(invoiceCode)) {
    return sendJson(res, 400, { error: 'ID invoice tidak valid.' });
  }

  try {
    const db = await getDb();
    const order = await db.collection('payments').findOne({ invoiceCode });
    if (!order) return sendJson(res, 404, { error: 'Pesanan tidak ditemukan.' });
    return sendJson(res, 200, { payment: publicPayment(order) });
  } catch (error) {
    console.error('payments/status: gagal membaca status pesanan', error);
    return sendJson(res, 503, { error: 'Status pembayaran tidak dapat dimuat. Coba lagi.' });
  }
}
