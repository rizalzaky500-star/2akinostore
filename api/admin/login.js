import { getAdminCredential } from '../_lib/db.js';
import { verifyPassword } from '../../src/lib/password.js';
import { buildSessionCookie, readJsonBody, sendJson } from '../_lib/http.js';

/**
 * POST /api/admin/login
 *
 * Verifies the admin password against the scrypt hash stored in MongoDB and
 * issues a signed session cookie. The password hash never reaches the client,
 * so the browser cannot compare passwords locally — which is the whole point
 * of moving this off localStorage.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }

  const body = await readJsonBody(req);
  const password = body?.password;
  if (typeof password !== 'string' || password.length === 0) {
    return sendJson(res, 400, { error: 'Password wajib diisi.' });
  }

  let credential;
  try {
    credential = await getAdminCredential();
  } catch (error) {
    console.error('admin/login: gagal membaca kredensial', error);
    return sendJson(res, 503, { error: 'Layanan admin sedang tidak tersedia.' });
  }

  let valid = false;
  try {
    valid = await verifyPassword(password, credential.passwordHash);
  } catch (error) {
    console.error('admin/login: verifikasi gagal', error);
    return sendJson(res, 503, { error: 'Layanan admin sedang tidak tersedia.' });
  }

  if (!valid) {
    // Deliberately vague: do not confirm whether a password exists.
    return sendJson(res, 401, { error: 'Password admin salah.' });
  }

  res.setHeader('Set-Cookie', buildSessionCookie(credential.passwordHash));
  return sendJson(res, 200, {
    ok: true,
    mustChangePassword: Boolean(credential.mustChangePassword),
  });
}
