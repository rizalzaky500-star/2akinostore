import { getAdminCredential } from './db.js';
import { readSessionForCurrentPassword, sendJson } from './http.js';

export async function requireAdmin(req, res) {
  let credential;
  try {
    credential = await getAdminCredential();
  } catch (error) {
    console.error('admin/catalog: gagal memeriksa sesi', error);
    sendJson(res, 503, { error: 'Layanan admin sedang tidak tersedia.' });
    return false;
  }

  if (!(await readSessionForCurrentPassword(req, credential))) {
    sendJson(res, 401, { error: 'Sesi admin tidak valid. Silakan masuk kembali.' });
    return false;
  }
  return true;
}
