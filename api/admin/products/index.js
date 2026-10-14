import { requireAdmin } from '../../_lib/admin.js';
import { CatalogError, createProduct } from '../../_lib/catalog.js';
import { readJsonBody, sendJson } from '../../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }
  if (!(await requireAdmin(req, res))) return;

  try {
    return sendJson(res, 201, { product: await createProduct(await readJsonBody(req)) });
  } catch (error) {
    if (error instanceof CatalogError) return sendJson(res, error.statusCode, { error: error.message });
    console.error('admin/products: gagal membuat produk', error);
    return sendJson(res, 503, { error: 'Produk gagal disimpan. Coba lagi.' });
  }
}
