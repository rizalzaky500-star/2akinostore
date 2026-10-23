import { timingSafeEqual } from 'node:crypto';

const PAYMENT_REQUESTS_URL = 'https://api.xendit.co/v3/payment_requests';

export async function createXenditPaymentRequest(order, secretKey) {
  const response = await fetch(PAYMENT_REQUESTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      'Idempotency-key': order.referenceId,
    },
    body: JSON.stringify({
      reference_id: order.referenceId,
      type: 'PAY',
      country: 'ID',
      currency: 'IDR',
      request_amount: order.amount,
      capture_method: 'AUTOMATIC',
      channel_code: 'QRIS',
      description: `Pembayaran ${order.invoiceCode} - ${order.productTitle}`,
      metadata: { invoice_code: order.invoiceCode },
    }),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Xendit mengembalikan respons yang tidak valid.');
  }
  if (!response.ok) {
    console.error('Xendit menolak Payment Request.', {
      status: response.status,
      errorCode: result?.error_code,
    });
    throw new Error('Payment Request QRIS gagal dibuat.');
  }

  const qrAction = Array.isArray(result.actions)
    ? result.actions.find(
        (action) =>
          action?.type === 'PRESENT_TO_CUSTOMER' &&
          typeof action.value === 'string' &&
          action.value.length > 0,
      )
    : null;
  if (!result.payment_request_id || !qrAction) {
    throw new Error('Respons Xendit tidak memuat QRIS yang dapat ditampilkan.');
  }

  return {
    paymentRequestId: result.payment_request_id,
    qrCode: qrAction.value,
    providerStatus: result.status || 'REQUIRES_ACTION',
    expiresAt: typeof (result.expires_at || result.expiry_date) === 'string'
      ? new Date(result.expires_at || result.expiry_date)
      : null,
  };
}

export function isValidCallbackToken(receivedToken, expectedToken) {
  if (
    typeof receivedToken !== 'string' ||
    typeof expectedToken !== 'string' ||
    receivedToken.length === 0 ||
    expectedToken.length === 0
  ) return false;
  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
