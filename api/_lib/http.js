import { signSession, verifySession } from './session.js';
import { isTrustedMutation } from '../../src/lib/requestSecurity.js';

/**
 * Shared helpers for the admin endpoints. Keeping the response shape and the
 * failure wording here means the login and password endpoints cannot drift.
 */

const MAX_BODY_BYTES = 64 * 1024;

export function sendJson(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

/**
 * Reads and parses a JSON request body. Returns null for anything that is not
 * a JSON object, so callers can reject with one consistent message. The body
 * is capped so an oversized payload cannot exhaust the function's memory, and
 * the content type is enforced so a plain HTML form cannot post here.
 */
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) return null;

  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;

  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
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
export function readSession(req) {
  const cookie = req.headers?.cookie || '';
  const match = cookie.match(/(?:^|;\s*)2akino_admin=([^;]+)/);
  if (!match) return null;
  return verifySession(decodeURIComponent(match[1]));
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

export function buildSessionCookie(passwordHash) {
  const token = signSession({ sub: 'admin', v: fingerprint(passwordHash) });
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

/**
 * Rejects a state-changing request that did not come from this site. Returns
 * true when the request may continue; otherwise it has already answered 403.
 */
export function requireTrustedOrigin(req, res) {
  if (isTrustedMutation(req)) return true;
  sendJson(res, 403, { error: 'Permintaan ditolak: origin tidak dikenal.' });
  return false;
}
