import { requireAdmin } from '../../_lib/admin.js';
import { CatalogError, migrateLegacyCatalog } from '../../_lib/catalog.js';
import { readJsonBody, sendJson } from '../../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }
  if (!(await requireAdmin(req, res))) return;

  const body = await readJsonBody(req);
  try {
    const result = await migrateLegacyCatalog(body);
    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) {
    if (error instanceof CatalogError) {
      return sendJson(res, error.statusCode, { error: error.message });
    }
    console.error('admin/catalog/migrate: gagal mengimpor katalog', error);
    return sendJson(res, 503, { error: 'Migrasi katalog gagal. Data yang sudah ada di MongoDB tidak ditimpa.' });
  }
}
