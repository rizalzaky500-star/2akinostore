import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeInvoiceCode, validateXenditEvent } from './paymentValidation.js';

const order = {
  referenceId: 'order-1',
  paymentRequestId: 'pr-1',
  amount: 15000,
};

function capturedPayment(overrides = {}) {
  return {
    reference_id: 'order-1',
    payment_request_id: 'pr-1',
    status: 'SUCCEEDED',
    currency: 'IDR',
    request_amount: 15000,
    captures: [{ capture_amount: 15000 }],
    ...overrides,
  };
}

test('normalizes invoice codes but rejects non-string values', () => {
  assert.equal(normalizeInvoiceCode(' inv-ab12 '), 'INV-AB12');
  assert.equal(normalizeInvoiceCode(null), '');
});

test('only accepts an exact successful Xendit QRIS capture', () => {
  assert.equal(validateXenditEvent('payment.capture', capturedPayment(), order), 'paid');
  assert.equal(
    validateXenditEvent('payment.capture', capturedPayment({ request_amount: 14000 }), order),
    'mismatch',
  );
  assert.equal(
    validateXenditEvent('payment.capture', capturedPayment({ currency: 'USD' }), order),
    'mismatch',
  );
  assert.equal(
    validateXenditEvent('payment.capture', capturedPayment({ reference_id: 'other-order' }), order),
    'mismatch',
  );
  assert.equal(
    validateXenditEvent('payment.capture', capturedPayment({ captures: [{ capture_amount: 14000 }] }), order),
    'mismatch',
  );
});

test('maps failure and expiry events without treating them as paid', () => {
  assert.equal(
    validateXenditEvent('payment.failure', { ...capturedPayment(), status: 'FAILED' }, order),
    'failed',
  );
  assert.equal(
    validateXenditEvent('payment_request.expiry', capturedPayment(), order),
    'expired',
  );
  assert.equal(validateXenditEvent('unhandled.event', capturedPayment(), order), null);
});
