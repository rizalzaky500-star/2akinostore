import { getAdminCredential } from '../_lib/db.js';
import { verifyPassword } from '../../src/lib/password.js';
import {
  buildSessionCookie,
  readJsonBody,
  requireTrustedOrigin,
  sendJson,
} from '../_lib/http.js';
import { clientKey, createRateLimiter } from '../../src/lib/requestSecurity.js';

const MAX_PASSWORD_LENGTH = 200;

// Two windows: a tight one per client that blunts a brute-force run, and a
// wider one so an attacker cannot simply wait out the short window. Both live
// per warm serverless instance, so this complements (never replaces) a long
// password and the platform's own edge protection.
const burstLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 1000 });
const attemptLimiter = createRateLimiter({ limit: 20, windowMs: 15 * 60 * 1000 });

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
  if (!requireTrustedOrigin(req, res)) return;

  const key = clientKey(req);
  const burst = burstLimiter.check(key);
  const attempt = attemptLimiter.check(key);
  if (!burst.allowed || !attempt.allowed) {
    const retryAfterMs = Math.max(burst.retryAfterMs, attempt.retryAfterMs);
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    return sendJson(res, 429, {
      error: 'Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi.',
    });
  }

  const body = await readJsonBody(req);
  const password = body?.password;
  if (typeof password !== 'string' || password.length === 0) {
    return sendJson(res, 400, { error: 'Password wajib diisi.' });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return sendJson(res, 400, { error: 'Password terlalu panjang.' });
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

  // A successful sign-in clears this client's counters so a legitimate owner
  // who mistyped a few times is not throttled afterwards.
  burstLimiter.reset(key);
  attemptLimiter.reset(key);

  res.setHeader('Set-Cookie', buildSessionCookie(credential.passwordHash));
  return sendJson(res, 200, {
    ok: true,
    mustChangePassword: Boolean(credential.mustChangePassword),
  });
}
