import { signSession, verifySession } from './session.js';

/**
 * Shared helpers for the admin endpoints. Keeping the response shape and the
 * failure wording here means the login and password endpoints cannot drift.
 */

export function sendJson(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/**
 * Reads and parses a JSON request body. Returns null for anything that is not
 * a JSON object, so callers can reject with one consistent message.
 */
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Validates the session cookie on a request. Returns the payload or null.
 * Used by the password-change endpoint so an anonymous caller cannot rotate
 * the admin password.
 */
export function readSession(req, secret) {
  const cookie = req.headers?.cookie || '';
  const match = cookie.match(/(?:^|;\s*)2akino_admin=([^;]+)/);
  if (!match) return null;
  return verifySession(decodeURIComponent(match[1]), secret);
}

/**
 * Validates a session AND checks it belongs to the current password. Sessions
 * carry a fingerprint of the password hash, so rotating the password
 * invalidates every token issued before the change while the browser that
 * made the change keeps the freshly issued one.
 */
export async function readSessionForCurrentPassword(req, credential, secret) {
  const session = readSession(req, secret);
  if (!session) return null;
  if (session.v !== fingerprint(credential.passwordHash)) return null;
  return session;
}

export function buildSessionCookie(passwordHash, secret) {
  const token = signSession({ sub: 'admin', v: fingerprint(passwordHash) }, secret);
  const attrs = [
    `2akino_admin=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=28800', // 8 hours
  ];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  return attrs.join('; ');
}

/**
 * A short, non-reversible marker of the current password hash. Sessions carry
 * it so that changing the password invalidates every previously issued
 * session. The hash itself never leaves the server.
 */
export function fingerprint(passwordHash) {
  return String(passwordHash).slice(-12);
}

export function clearSessionCookie() {
  return '2akino_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}
