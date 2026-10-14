import { clearSessionCookie, sendJson } from '../_lib/http.js';

/**
 * POST /api/admin/logout
 *
 * Expires the session cookie. Always reports success: logging out is a
 * client-side decision, and there is no server-side session table to clean up.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
  }

  res.setHeader('Set-Cookie', clearSessionCookie());
  return sendJson(res, 200, { ok: true });
}
