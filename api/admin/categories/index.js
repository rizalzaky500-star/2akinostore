import { requireAdmin } from '../../_lib/admin.js';
import { CatalogError, createCategory, deleteCategory } from '../../_lib/catalog.js';
import { readJsonBody, sendJson } from '../../_lib/http.js';

export default async function handler(req, res) {
  if (!['POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'POST, DELETE');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }
  if (!(await requireAdmin(req, res))) return;

  const body = await readJsonBody(req);
  try {
    if (req.method === 'DELETE') {
      if (typeof body?.name !== 'string') {
        return sendJson(res, 400, { error: 'Nama kategori wajib diisi.' });
      }
      const result = await deleteCategory(body.name);
      if (result.missing) return sendJson(res, 404, { error: 'Kategori tidak ditemukan.' });
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 201, { category: await createCategory(body) });
  } catch (error) {
    if (error instanceof CatalogError) return sendJson(res, error.statusCode, { error: error.message });
    console.error('admin/categories: gagal mengubah kategori', error);
    return sendJson(res, 503, { error: 'Kategori gagal disimpan. Coba lagi.' });
  }
}
