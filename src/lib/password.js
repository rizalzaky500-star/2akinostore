import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// Format: scrypt$N$r$p$<salt-base64>$<hash-base64>
const PREFIX = 'scrypt';
const COST = 16384; // N
const BLOCK_SIZE = 8; // r
const PARALLELISM = 1; // p
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hashes a plaintext password with a fresh random salt. The resulting string
 * is self-describing: it carries the parameters so verification keeps working
 * if the cost is raised later. Stored as-is in MongoDB.
 */
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password tidak boleh kosong.');
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(normalizePassword(password), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
  });
  return [
    PREFIX,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verifies a plaintext password against a stored hash. Returns false for any
 * malformed input rather than throwing, so a corrupt stored value fails closed
 * instead of crashing the login endpoint.
 */
export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw] = parts;
  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelism = Number(parallelRaw);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelism)) {
    return false;
  }

  let salt;
  let expected;
  try {
    salt = Buffer.from(saltRaw, 'base64');
    expected = Buffer.from(hashRaw, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let derived;
  try {
    derived = await scryptAsync(normalizePassword(password), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
    });
  } catch {
    return false;
  }

  // timingSafeEqual throws when lengths differ, so guard before calling it.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Unicode-normalizes so the same typed password hashes identically regardless
 * of the input method, and strips nothing else — length and case are kept.
 */
function normalizePassword(password) {
  return password.normalize('NFKC');
}
