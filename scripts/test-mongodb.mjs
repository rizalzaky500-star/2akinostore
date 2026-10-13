/**
 * One-off connectivity check for the MongoDB Atlas cluster referenced by .env.
 *
 * Run with:  node scripts/test-mongodb.mjs
 *
 * It is deliberately not part of `npm test`: it needs network access and live
 * credentials, so it must stay out of CI.
 *
 * Note on DNS: `mongodb+srv://` needs both an SRV and a TXT lookup. Some home
 * routers answer SRV but time out on TXT, which makes the driver hang until it
 * gives up. This script therefore resolves the SRV/TXT records itself through a
 * public resolver and builds a standard `mongodb://` URI, sidestepping the
 * router. Set MONGODB_DNS_SERVERS to override the resolvers (comma separated).
 */
import { readFileSync } from 'node:fs';
import { Resolver } from 'node:dns/promises';
import { MongoClient } from 'mongodb';

function loadEnv(path = new URL('../.env', import.meta.url)) {
  const text = readFileSync(path, 'utf8');
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = loadEnv();
const password = env.MONGODB_PASSWORD ?? process.env.MONGODB_PASSWORD ?? '';
const mask = (s) => (s ? `${s.slice(0, 2)}${'*'.repeat(Math.max(s.length - 2, 0))}` : '(unset)');

/**
 * Expands a mongodb+srv URI into a plain mongodb:// URI using a resolver we
 * control, so a router that drops TXT queries cannot stall the connection.
 */
async function resolveSrvUri(srvUri, dnsServers) {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^@/]+)@([^/?]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) return { uri: srvUri, dns: 'system (uri was not srv form)' };

  const [, credentials, host, dbPath = '', query = ''] = match;
  const resolver = new Resolver();
  if (dnsServers.length) resolver.setServers(dnsServers);

  const [srvRecords, txtRecords] = await Promise.all([
    resolver.resolveSrv(`_mongodb._tcp.${host}`),
    resolver.resolveTxt(host),
  ]);

  const hosts = srvRecords.map((record) => `${record.name}:${record.port}`).join(',');
  const txtParams = txtRecords.flat().join('&');
  const baseParams = query.startsWith('?') ? query.slice(1) : '';
  const params = [txtParams, baseParams].filter(Boolean).join('&');

  const uri = `mongodb://${credentials}@${hosts}${dbPath}${params ? `?${params}` : ''}`;
  return { uri, dns: dnsServers.join(', ') || 'system' };
}

const srvUri = env.MONGODB_URI ?? process.env.MONGODB_URI;
if (!srvUri) {
  console.error('MONGODB_URI is missing from .env');
  process.exit(1);
}

const dnsServers = (process.env.MONGODB_DNS_SERVERS ?? '8.8.8.8,1.1.1.1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

console.log('user:', env.MONGODB_USERNAME ?? '(unset)', '| password:', mask(password));
console.log('dns servers:', dnsServers.join(', ') || 'system');

let client;
try {
  const { uri, dns } = await resolveSrvUri(srvUri, dnsServers);
  console.log('1. SRV/TXT resolve   OK via', dns);
  console.log('   hosts:',
    uri.replace(/\/\/[^@]*@/, '//').split('?')[0].split('/').slice(0, 3).join('/'));

  client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  console.log('2. connect           OK');

  const ping = await client.db('admin').command({ ping: 1 });
  console.log('3. ping              OK ->', JSON.stringify(ping));

  const admin = client.db('admin').admin();
  try {
    const build = await admin.command({ buildInfo: 1 });
    console.log('4. server version    OK ->', build.version);
  } catch (error) {
    console.log('4. server version    SKIPPED ->', error.message);
  }

  const { databases } = await admin.listDatabases();
  console.log('5. listDatabases     OK ->', databases.map((d) => d.name).join(', '));

  // Real write/read/delete round-trip so we know the user is not read-only.
  const collection = client.db('2akinostore_check').collection('connectivity');
  const doc = { _id: 'selftest', checkedAt: new Date(), note: 'connection check' };

  await collection.deleteOne({ _id: doc._id });
  await collection.insertOne(doc);
  console.log('6. insertOne         OK');

  const found = await collection.findOne({ _id: doc._id });
  console.log('7. findOne           OK ->', JSON.stringify(found));

  const deleted = await collection.deleteOne({ _id: doc._id });
  console.log('8. deleteOne         OK -> deleted', deleted.deletedCount);

  await collection.drop().catch(() => {});

  console.log('\nALL CHECKS PASSED — credentials, network and read/write access are working.');
} catch (error) {
  const raw = `${error.message} ${error.cause?.message ?? ''}`;
  console.error('\nCONNECTION FAILED:', error.message);
  if (/authentication failed|bad auth|auth.*failed/i.test(raw)) {
    console.error('-> the username or password in .env is wrong, or the user lacks access to this cluster.');
  } else if (/ENOTFOUND|querySrv|queryTxt|getaddrinfo/i.test(raw)) {
    console.error('-> SRV/TXT lookup failed. Try MONGODB_DNS_SERVERS=1.1.1.1 or a different network.');
  } else if (/connection .* closed/i.test(raw)) {
    // Atlas accepts the TCP/TLS connection and then closes it without a single
    // byte when the source IP is not in the project access list. A bad password
    // would instead raise an authentication error, so this wording is safe.
    console.error('-> the cluster closed the connection without a MongoDB greeting.');
    console.error('   This usually means this machine\'s public IP is not in the Atlas');
    console.error('   Network Access allowlist. Add it (or 0.0.0.0/0 for testing only) at:');
    console.error('   Atlas > Security > Network Access > IP Access List.');
  } else if (/timed out|server selection/i.test(raw)) {
    console.error('-> could not reach the cluster within the timeout. Check the network,');
    console.error('   or add this machine to the Network Access / IP allowlist in Atlas.');
  }
  process.exitCode = 1;
} finally {
  await client?.close();
}
