/**
 * Request-level security helpers shared by the serverless API routes.
 *
 * Deliberately free of Node-only imports (only the global `URL`), so the
 * behaviour is unit testable with plain request objects.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects cross-site state-changing requests.
 *
 * The session cookie is already `SameSite=Strict`, which browsers enforce.
 * This is the server-side half of that defence: it stops a request that
 * carries a valid cookie from a different origin (older browsers, embedded
 * webviews, or a proxy that strips SameSite) from mutating the catalog.
 *
 * Requests without an `Origin` header (curl, server-to-server calls, smoke
 * tests) are allowed because they still need a valid signed cookie; browsers
 * always attach `Origin` to cross-site writes.
 */
export function isTrustedMutation(req) {
  const method = String(req?.method || '').toUpperCase();
  if (SAFE_METHODS.has(method)) return true;

  const headers = req?.headers || {};
  const origin = headers.origin;

  if (!origin) {
    const site = String(headers['sec-fetch-site'] || '').toLowerCase();
    return site === '' || site === 'same-origin' || site === 'none';
  }

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const host = headers['x-forwarded-host'] || headers.host;
  if (!host || parsed.host !== host) return false;

  const forwardedProto = headers['x-forwarded-proto'];
  if (forwardedProto) {
    const proto = String(forwardedProto).split(',')[0].trim();
    if (proto && parsed.protocol !== `${proto}:`) return false;
  }

  return true;
}

/**
 * Fixed-window limiter kept in memory. Serverless instances are short-lived,
 * so this is best-effort, but it still turns a brute-force attempt from a
 * single client into a handful of attempts per warm instance instead of an
 * unbounded stream.
 */
export function createRateLimiter({ limit, windowMs, clock = Date.now } = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError('limit harus bilangan bulat positif.');
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new TypeError('windowMs harus bilangan positif.');
  }

  const buckets = new Map();

  function prune(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    check(rawKey) {
      const now = clock();
      prune(now);
      const key = String(rawKey || 'unknown');
      const bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
      }
      if (bucket.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
      }
      bucket.count += 1;
      return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
    },
    reset(rawKey) {
      buckets.delete(String(rawKey || 'unknown'));
    },
    get size() {
      return buckets.size;
    },
  };
}

/** Best-effort client identity for rate limiting. */
export function clientKey(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0];
  return first.trim() || req?.socket?.remoteAddress || 'unknown';
}
