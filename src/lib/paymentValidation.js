export function normalizeInvoiceCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function validateXenditEvent(event, data, order) {
  if (
    !data ||
    data.reference_id !== order.referenceId ||
    (order.paymentRequestId && data.payment_request_id !== order.paymentRequestId) ||
    typeof data.payment_request_id !== 'string' ||
    !data.payment_request_id
  ) {
    return 'mismatch';
  }

  if (event === 'payment.capture') {
    const capturedAmount = Array.isArray(data.captures)
      ? data.captures.reduce(
          (total, capture) => total + (Number.isFinite(capture?.capture_amount) ? capture.capture_amount : 0),
          0,
        )
      : 0;
    if (
      data.status !== 'SUCCEEDED' ||
      data.currency !== 'IDR' ||
      data.request_amount !== order.amount ||
      capturedAmount !== order.amount
    ) {
      return 'mismatch';
    }
    return 'paid';
  }

  if (event === 'payment.failure' && data.status === 'FAILED') return 'failed';
  if (event === 'payment_request.expiry') return 'expired';
  return null;
}
