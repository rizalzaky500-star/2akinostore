import { MongoClient } from 'mongodb';
import { hashPassword } from '../../src/lib/password.js';
import { SEED_ADMIN_PASSWORD } from '../../src/lib/seedPassword.js';

const DB_NAME = process.env.MONGODB_DB || '2akinostore';
const ADMIN_COLLECTION = 'admin_credentials';
const ADMIN_DOC_ID = 'admin';

/**
 * The Atlas shard negotiates TLS on the first handshake. Without an explicit
 * `tls: true` the mongodb@7 driver closes the socket and reports the
 * misleading "connection <monitor> ... closed". Kept in one place so every
 * endpoint inherits the fix.
 */
const CLIENT_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  tls: true,
};

let cachedClient = null;

/**
 * Reuses one MongoClient across warm serverless invocations. Creating a
 * client per request exhausts the connection pool under load.
 */
export async function getDb() {
  if (!cachedClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI belum dikonfigurasi.');
    }
    cachedClient = new MongoClient(uri, CLIENT_OPTIONS);
    await cachedClient.connect();
  }
  return cachedClient.db(DB_NAME);
}

async function adminCollection() {
  const db = await getDb();
  return db.collection(ADMIN_COLLECTION);
}

/**
 * Returns the stored admin credential document, seeding it with the default
 * password on first use. Seeding only happens when no document exists, so a
 * password an admin has already changed is never reset.
 */
export async function getAdminCredential() {
  const collection = await adminCollection();
  const existing = await collection.findOne({ _id: ADMIN_DOC_ID });
  if (existing) return existing;

  const seeded = {
    _id: ADMIN_DOC_ID,
    passwordHash: await hashPassword(SEED_ADMIN_PASSWORD),
    mustChangePassword: true,
    updatedAt: new Date(),
  };
  await collection.insertOne(seeded);
  return seeded;
}

export async function updateAdminPassword(passwordHash) {
  const collection = await adminCollection();
  await collection.updateOne(
    { _id: ADMIN_DOC_ID },
    { $set: { passwordHash, mustChangePassword: false, updatedAt: new Date() } },
    { upsert: true },
  );
}
