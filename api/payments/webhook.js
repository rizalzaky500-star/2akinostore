import { getDb, getMongoClient } from '../_lib/db.js';
import { readJsonBody, sendJson } from '../_lib/http.js';
import { validateXenditEvent } from '../../src/lib/paymentValidation.js';
import { isValidCallbackToken } from '../_lib/xendit.js';

async function updatePayment(event, data) {
  const db = await getDb();
  const orders = db.collection('payments');
  const order = await orders.findOne({ referenceId: data.reference_id });
  if (!order) return { result: 'ignored' };

  const outcome = validateXenditEvent(event, data, order);
  if (outcome === 'mismatch') {
    await orders.updateOne(
      { _id: order._id, status: { $ne: 'paid' } },
      {
        $set: {
          status: 'review',
          reviewReason: 'provider_payment_mismatch',
          updatedAt: new Date(),
        },
      },
    );
    console.warn('payments/webhook: detail pembayaran Xendit tidak cocok', {
      invoiceCode: order.invoiceCode,
      event,
    });
    return { result: 'review' };
  }
  if (!outcome) return { result: 'ignored' };

  if (outcome === 'failed' || outcome === 'expired') {
    await orders.updateOne(
      { _id: order._id, status: { $in: ['creating', 'pending'] } },
      {
        $set: {
          status: outcome,
          paymentRequestId: data.payment_request_id,
          providerStatus: data.status || event,
          updatedAt: new Date(),
        },
      },
    );
    return { result: outcome };
  }

  const client = await getMongoClient();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const currentOrder = await orders.findOne({ _id: order._id }, { session });
      if (!currentOrder || currentOrder.status === 'paid') return;

      let fulfillmentStatus = 'ready';
      const products = db.collection('products');
      const finiteStock = await products.findOneAndUpdate(
        { _id: currentOrder.productId, stock: { $gt: 0 } },
        { $inc: { stock: -1 } },
        { returnDocument: 'after', session },
      );
      if (!finiteStock) {
        const unlimitedStock = await products.findOne(
          {
            _id: currentOrder.productId,
            $or: [{ stock: null }, { stock: { $exists: false } }],
          },
          { session },
        );
        if (!unlimitedStock) fulfillmentStatus = 'needs_attention';
      }

      await orders.updateOne(
        { _id: currentOrder._id, status: { $ne: 'paid' } },
        {
          $set: {
            status: 'paid',
            paymentRequestId: data.payment_request_id,
            providerStatus: data.status,
            paymentId: data.payment_id,
            fulfillmentStatus,
            paidAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return { result: 'paid' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }

  const expectedToken = process.env.XENDIT_WEBHOOK_TOKEN;
  const receivedToken = req.headers?.['x-callback-token'];
  if (!expectedToken) {
    return sendJson(res, 503, { error: 'Callback token Xendit belum dikonfigurasi.' });
  }
  if (!isValidCallbackToken(receivedToken, expectedToken)) {
    return sendJson(res, 401, { error: 'Callback token tidak valid.' });
  }

  const body = await readJsonBody(req);
  if (!body || typeof body.event !== 'string' || !body.data || typeof body.data !== 'object') {
    return sendJson(res, 400, { error: 'Payload webhook tidak valid.' });
  }

  try {
    const result = await updatePayment(body.event, body.data);
    return sendJson(res, 200, { ok: true, result: result.result });
  } catch (error) {
    console.error('payments/webhook: gagal memproses callback Xendit', error);
    return sendJson(res, 503, { error: 'Webhook gagal diproses. Xendit dapat mencoba kembali.' });
  }
}
