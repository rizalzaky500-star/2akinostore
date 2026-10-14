import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogProduct, fetchCatalog, migrateLegacyCatalog, removeCatalogProduct } from './catalogApi.js';

test('catalog client reads from the public API and includes same-origin credentials', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (...args) => {
    request = args;
    return new Response(JSON.stringify({ categories: [], products: [] }), { status: 200 });
  };

  try {
    assert.deepEqual(await fetchCatalog(), { categories: [], products: [] });
    assert.equal(request[0], '/api/catalog');
    assert.equal(request[1].credentials, 'same-origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin catalog writes use authenticated API routes and send JSON', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (...args) => {
    requests.push(args);
    return new Response(JSON.stringify({ product: { id: 'p1' }, ok: true }), { status: 201 });
  };

  try {
    await migrateLegacyCatalog([{ name: 'Netflix' }], [{ id: 'p1' }]);
    const product = await createCatalogProduct({ title: 'Plan' });
    await removeCatalogProduct('product / 1');

    assert.equal(requests[0][0], '/api/admin/catalog/migrate');
    assert.deepEqual(JSON.parse(requests[0][1].body), {
      categories: [{ name: 'Netflix' }],
      products: [{ id: 'p1' }],
    });
    assert.equal(requests[1][0], '/api/admin/products');
    assert.deepEqual(product, { id: 'p1' });
    assert.equal(requests[2][0], '/api/admin/products/by-id?id=product%20%2F%201');
    assert.equal(requests[2][1].method, 'DELETE');
    assert.equal(requests[2][1].credentials, 'same-origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('catalog client surfaces server failures', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Database unavailable.' }), { status: 503 });

  try {
    await assert.rejects(fetchCatalog(), /Database unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
