import assert from 'node:assert/strict';
import test from 'node:test';
import { createPayment, fetchAdminPayments, fetchPaymentStatus } from './paymentApi.js';

test('creating a payment posts product and customer details to the server', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (...args) => {
    request = args;
    return new Response(JSON.stringify({ invoice: { code: 'INV-0123456789ABCDEF' } }), { status: 201 });
  };

  try {
    assert.deepEqual(
      await createPayment({ productId: 'product-1', customerName: 'Rizal', customerWA: '081234567890' }),
      { code: 'INV-0123456789ABCDEF' },
    );
    assert.equal(request[0], '/api/payments/create');
    assert.equal(request[1].method, 'POST');
    assert.equal(request[1].credentials, 'same-origin');
    assert.deepEqual(JSON.parse(request[1].body), {
      productId: 'product-1',
      customerName: 'Rizal',
      customerWA: '081234567890',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('payment status and admin history use their server endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (...args) => {
    requests.push(args);
    return new Response(JSON.stringify({ payment: { status: 'pending' }, payments: [] }), { status: 200 });
  };

  try {
    assert.deepEqual(await fetchPaymentStatus('INV-0123456789ABCDEF'), { status: 'pending' });
    assert.deepEqual(await fetchAdminPayments(), []);
    assert.equal(requests[0][0], '/api/payments/status');
    assert.deepEqual(JSON.parse(requests[0][1].body), { code: 'INV-0123456789ABCDEF' });
    assert.equal(requests[1][0], '/api/admin/payments');
    assert.equal(requests[1][1].credentials, 'same-origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('payment API surfaces server errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'QRIS gagal dibuat.' }), { status: 502 });

  try {
    await assert.rejects(createPayment({}), /QRIS gagal dibuat/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
