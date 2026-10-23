import { requireAdmin } from '../../_lib/admin.js';
import { getDb } from '../../_lib/db.js';
import { sendJson } from '../../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }
  if (!(await requireAdmin(req, res))) return;

  try {
    const db = await getDb();
    const orders = await db.collection('payments')
      .find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
    return sendJson(res, 200, {
      payments: orders.map(({ _id, referenceId, paymentRequestId, qrCode, ...payment }) => payment),
    });
  } catch (error) {
    console.error('admin/payments: gagal membaca transaksi', error);
    return sendJson(res, 503, { error: 'Riwayat pembayaran tidak dapat dimuat. Coba lagi.' });
  }
}
