import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from './password.js';
import { SEED_ADMIN_PASSWORD } from './seedPassword.js';

test('a correct password verifies against its own hash', async () => {
  const hash = await hashPassword('rahasia123');
  assert.equal(await verifyPassword('rahasia123', hash), true);
});

test('the seed admin password round-trips', async () => {
  const hash = await hashPassword(SEED_ADMIN_PASSWORD);
  assert.equal(await verifyPassword(SEED_ADMIN_PASSWORD, hash), true);
});

test('a wrong password does not verify', async () => {
  const hash = await hashPassword('rahasia123');
  assert.equal(await verifyPassword('rahasia124', hash), false);
  assert.equal(await verifyPassword('', hash), false);
  assert.equal(await verifyPassword('RAHASIA123', hash), false);
});

test('the same password hashes differently each time', async () => {
  const a = await hashPassword('sama');
  const b = await hashPassword('sama');
  assert.notEqual(a, b, 'salted hashes must not be identical');
  assert.equal(await verifyPassword('sama', a), true);
  assert.equal(await verifyPassword('sama', b), true);
});

test('the stored hash never contains the plaintext', async () => {
  const hash = await hashPassword('jangan-terlihat');
  assert.equal(hash.includes('jangan-terlihat'), false);
  assert.match(hash, /^scrypt\$/);
});

test('verification fails closed on malformed stored hashes', async () => {
  assert.equal(await verifyPassword('apa saja', ''), false);
  assert.equal(await verifyPassword('apa saja', 'plaintext-lama'), false);
  assert.equal(await verifyPassword('apa saja', 'scrypt$1$2$3$notbase64$x'), false);
  assert.equal(await verifyPassword('apa saja', 'bcrypt$16384$8$1$c2FsdA==$aGFzaA=='), false);
  assert.equal(await verifyPassword('apa saja', null), false);
  assert.equal(await verifyPassword('apa saja', undefined), false);
});

test('hashing rejects an empty or non-string password', async () => {
  await assert.rejects(() => hashPassword(''), /kosong/);
  await assert.rejects(() => hashPassword(undefined), /kosong/);
});
