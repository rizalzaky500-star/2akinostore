import { requireAdmin } from '../../_lib/admin.js';
import { CatalogError, decrementStock, deleteProduct, updateProduct } from '../../_lib/catalog.js';
import { readJsonBody, sendJson } from '../../_lib/http.js';

export default async function handler(req, res) {
  if (!['PATCH', 'DELETE', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'PATCH, DELETE, POST');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }
  if (!(await requireAdmin(req, res))) return;

  const id = req.query?.id;
  try {
    if (req.method === 'DELETE') {
      const deleted = await deleteProduct(id);
      if (!deleted) return sendJson(res, 404, { error: 'Produk tidak ditemukan.' });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const count = body?.count ?? 1;
      const product = await decrementStock(id, count);
      if (!product) return sendJson(res, 404, { error: 'Produk tidak ditemukan.' });
      return sendJson(res, 200, { product });
    }

    const product = await updateProduct(id, await readJsonBody(req));
    if (!product) return sendJson(res, 404, { error: 'Produk tidak ditemukan.' });
    return sendJson(res, 200, { product });
  } catch (error) {
    if (error instanceof CatalogError) return sendJson(res, error.statusCode, { error: error.message });
    console.error('admin/products/by-id: gagal mengubah produk', error);
    return sendJson(res, 503, { error: 'Perubahan produk gagal disimpan. Coba lagi.' });
  }
}
