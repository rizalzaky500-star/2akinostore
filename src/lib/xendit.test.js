import assert from 'node:assert/strict';
import test from 'node:test';
import { createXenditPaymentRequest, isValidCallbackToken } from '../../api/_lib/xendit.js';

test('creates a server-side Xendit QRIS payment request with server-calculated amount', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (...args) => {
    request = args;
    return new Response(JSON.stringify({
      payment_request_id: 'pr-test',
      status: 'REQUIRES_ACTION',
      actions: [{ type: 'PRESENT_TO_CUSTOMER', value: '000201010212...' }],
    }), { status: 201 });
  };

  try {
    const result = await createXenditPaymentRequest({
      referenceId: 'ref-test',
      invoiceCode: 'INV-0123456789ABCDEF',
      productTitle: 'Premium',
      amount: 15000,
    }, 'test-secret');

    assert.equal(request[0], 'https://api.xendit.co/v3/payment_requests');
    assert.equal(request[1].method, 'POST');
    assert.equal(request[1].headers.Authorization, `Basic ${Buffer.from('test-secret:').toString('base64')}`);
    assert.equal(request[1].headers['Idempotency-key'], 'ref-test');
    assert.deepEqual(JSON.parse(request[1].body), {
      reference_id: 'ref-test',
      type: 'PAY',
      country: 'ID',
      currency: 'IDR',
      request_amount: 15000,
      capture_method: 'AUTOMATIC',
      channel_code: 'QRIS',
      description: 'Pembayaran INV-0123456789ABCDEF - Premium',
      metadata: { invoice_code: 'INV-0123456789ABCDEF' },
    });
    assert.deepEqual(result, {
      paymentRequestId: 'pr-test',
      qrCode: '000201010212...',
      providerStatus: 'REQUIRES_ACTION',
      expiresAt: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects a Xendit response without a customer-presentable QR action', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    payment_request_id: 'pr-test',
    actions: [],
  }), { status: 201 });

  try {
    await assert.rejects(
      createXenditPaymentRequest({ referenceId: 'ref', invoiceCode: 'INV', amount: 1 }, 'secret'),
      /does not contain|tidak memuat QRIS/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('compares Xendit callback tokens without accepting absent or different tokens', () => {
  assert.equal(isValidCallbackToken('callback-token', 'callback-token'), true);
  assert.equal(isValidCallbackToken('wrong-token', 'callback-token'), false);
  assert.equal(isValidCallbackToken('', ''), false);
  assert.equal(isValidCallbackToken(undefined, 'callback-token'), false);
});
