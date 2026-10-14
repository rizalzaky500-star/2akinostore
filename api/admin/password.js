import { getAdminCredential, updateAdminPassword } from '../_lib/db.js';
import { DEFAULT_ADMIN_PASSWORD, hashPassword, verifyPassword } from '../../src/lib/password.js';
import {
  buildSessionCookie,
  fingerprint,
  readJsonBody,
  readSessionForCurrentPassword,
  sendJson,
} from '../_lib/http.js';

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/admin/password
 *
 * Rotates the admin password. Requires a valid session cookie and the current
 * password, so a stolen session alone cannot lock the owner out. The new hash
 * is written to MongoDB, which is what makes the change apply on every device
 * instead of only the browser that submitted the form.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }


  const body = await readJsonBody(req);
  const currentPassword = body?.currentPassword;
  const newPassword = body?.newPassword;

  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    return sendJson(res, 400, { error: 'Password saat ini wajib diisi.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return sendJson(res, 400, {
      error: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter.`,
    });
  }
  if (newPassword === DEFAULT_ADMIN_PASSWORD) {
    return sendJson(res, 400, { error: 'Password baru tidak boleh sama dengan password default.' });
  }

  let credential;
  try {
    credential = await getAdminCredential();
  } catch (error) {
    console.error('admin/password: gagal membaca kredensial', error);
    return sendJson(res, 503, { error: 'Layanan admin sedang tidak tersedia.' });
  }


  // Reject stale sessions: a cookie issued before the last password change
  // carries the old fingerprint and must not authorise another rotation.
  if (!(await readSessionForCurrentPassword(req, credential))) {
    return sendJson(res, 401, { error: 'Sesi admin tidak valid. Silakan masuk kembali.' });
  }

  if (!(await verifyPassword(currentPassword, credential.passwordHash))) {
    return sendJson(res, 401, { error: 'Password saat ini salah.' });
  }

  const passwordHash = await hashPassword(newPassword);
  try {
    await updateAdminPassword(passwordHash);
  } catch (error) {
    console.error('admin/password: gagal menyimpan', error);
    return sendJson(res, 503, { error: 'Password gagal disimpan. Coba lagi.' });
  }

  // Re-issue the cookie with the new fingerprint so this browser stays logged
  // in while every other session is invalidated.
  res.setHeader('Set-Cookie', buildSessionCookie(passwordHash));
  return sendJson(res, 200, {
    ok: true,
    session: fingerprint(passwordHash),
  });
}
