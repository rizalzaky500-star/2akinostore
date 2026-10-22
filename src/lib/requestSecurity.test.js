import assert from 'node:assert/strict';
import test from 'node:test';
import { clientKey, createRateLimiter, isTrustedMutation } from './requestSecurity.js';

function request(method, headers = {}) {
  return { method, headers };
}

test('safe methods are always allowed', () => {
  assert.equal(isTrustedMutation(request('GET', { origin: 'https://evil.example' })), true);
  assert.equal(isTrustedMutation(request('HEAD', { origin: 'https://evil.example' })), true);
  assert.equal(isTrustedMutation(request('OPTIONS', {})), true);
});

test('a same-origin mutation is allowed', () => {
  assert.equal(
    isTrustedMutation(request('POST', { origin: 'https://toko.example', host: 'toko.example' })),
    true,
  );
});

test('the forwarded host wins behind a proxy', () => {
  assert.equal(
    isTrustedMutation(
      request('POST', {
        origin: 'https://toko.example',
        host: 'internal:3000',
        'x-forwarded-host': 'toko.example',
      }),
    ),
    true,
  );
});

test('a cross-origin mutation is rejected', () => {
  assert.equal(
    isTrustedMutation(request('PATCH', { origin: 'https://evil.example', host: 'toko.example' })),
    false,
  );
});

test('a protocol mismatch is rejected when the proxy reports one', () => {
  assert.equal(
    isTrustedMutation(
      request('DELETE', {
        origin: 'http://toko.example',
        host: 'toko.example',
        'x-forwarded-proto': 'https',
      }),
    ),
    false,
  );
});

test('a malformed origin is rejected', () => {
  assert.equal(isTrustedMutation(request('POST', { origin: 'not a url', host: 'toko.example' })), false);
});

test('a mutation without origin is allowed for same-origin or non-browser callers', () => {
  assert.equal(isTrustedMutation(request('POST', {})), true);
  assert.equal(isTrustedMutation(request('POST', { 'sec-fetch-site': 'same-origin' })), true);
  assert.equal(isTrustedMutation(request('POST', { 'sec-fetch-site': 'none' })), true);
  assert.equal(isTrustedMutation(request('POST', { 'sec-fetch-site': 'cross-site' })), false);
});

test('the limiter stops a client once the window budget is spent', () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, clock: () => now });

  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, true);
  const blocked = limiter.check('ip');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterMs, 1000);

  // A different client keeps its own budget.
  assert.equal(limiter.check('other').allowed, true);

  now = 1000;
  assert.equal(limiter.check('ip').allowed, true);
});

test('the limiter can reset one client', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, clock: () => 0 });
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, false);
  limiter.reset('ip');
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.size, 1);
});

test('the limiter validates its configuration', () => {
  assert.throws(() => createRateLimiter({ limit: 0, windowMs: 1000 }), TypeError);
  assert.throws(() => createRateLimiter({ limit: 1.5, windowMs: 1000 }), TypeError);
  assert.throws(() => createRateLimiter({ limit: 1, windowMs: 0 }), TypeError);
});

test('the client key prefers the first forwarded address', () => {
  assert.equal(clientKey(request('POST', { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })), '1.2.3.4');
  assert.equal(clientKey({ method: 'POST', headers: {}, socket: { remoteAddress: '::1' } }), '::1');
  assert.equal(clientKey({ method: 'POST', headers: {} }), 'unknown');
});
