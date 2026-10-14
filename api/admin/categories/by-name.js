import { requireAdmin } from '../../_lib/admin.js';
import { CatalogError, updateCategory } from '../../_lib/catalog.js';
import { readJsonBody, sendJson } from '../../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }
  if (!(await requireAdmin(req, res))) return;

  try {
    const category = await updateCategory(req.query?.name, await readJsonBody(req));
    if (!category) return sendJson(res, 404, { error: 'Kategori tidak ditemukan.' });
    return sendJson(res, 200, { category });
  } catch (error) {
    if (error instanceof CatalogError) return sendJson(res, error.statusCode, { error: error.message });
    console.error('admin/categories/by-name: gagal mengubah kategori', error);
    return sendJson(res, 503, { error: 'Perubahan kategori gagal disimpan. Coba lagi.' });
  }
}
