import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, stateless session tokens. They are HMAC-signed so the client cannot
 * forge one by editing the cookie, and they carry no secret material — only an
 * identifier and a fingerprint of the current password hash.
 */

const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error('ADMIN_SESSION_SECRET belum dikonfigurasi (minimal 16 karakter).');
  }
  return value;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function signSession(payload, providedSecret, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const key = providedSecret || secret();
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = base64url(JSON.stringify(body));
  return `${encoded}.${sign(encoded, key)}`;
}

export function verifySession(token, providedSecret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  let key;
  try {
    key = providedSecret || secret();
  } catch {
    return null;
  }

  const expected = sign(encoded, key);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  let body;
  try {
    body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!body || typeof body.exp !== 'number') return null;
  if (body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

function sign(value, key) {
  return createHmac('sha256', key).update(value).digest('base64url');
}
