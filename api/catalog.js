import { readCatalog } from './_lib/catalog.js';
import { sendJson } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }
  res.setHeader('Cache-Control', 'no-store');

  try {
    return sendJson(res, 200, await readCatalog());
  } catch (error) {
    console.error('catalog: gagal membaca katalog', error);
    return sendJson(res, 503, { error: 'Katalog sedang tidak tersedia. Coba muat ulang halaman.' });
  }
}
