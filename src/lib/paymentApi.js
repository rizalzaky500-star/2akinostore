async function request(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Respons server tidak valid. Coba muat ulang halaman.');
  }
  if (!response.ok) {
    throw new Error(result?.error || 'Permintaan pembayaran gagal. Coba lagi.');
  }
  return result;
}

export async function createPayment({ productId, customerName, customerWA }) {
  const result = await request('/api/payments/create', { productId, customerName, customerWA });
  return result.invoice;
}

export async function fetchPaymentStatus(code) {
  const result = await request('/api/payments/status', { code });
  return result.payment;
}

export async function fetchAdminPayments() {
  const response = await fetch('/api/admin/payments', { credentials: 'same-origin' });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Respons server tidak valid. Coba muat ulang halaman.');
  }
  if (!response.ok) {
    throw new Error(result?.error || 'Riwayat pembayaran gagal dimuat.');
  }
  return result.payments;
}
