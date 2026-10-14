/**
 * Browser-side client for the admin auth endpoints.
 *
 * The admin password is verified on the server (api/admin/login.js) against a
 * scrypt hash in MongoDB. The browser never receives the hash or the database
 * credentials, which is why this replaces the old localStorage comparison.
 *
 * Every call reports whether the API was reachable. App.jsx falls back to the
 * legacy localStorage password when `reachable` is false, so a dashboard that
 * is briefly offline during rollout still lets the owner sign in.
 */

const BASE = '/api/admin';

async function post(path, payload) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, ok: response.ok, data };
}

/**
 * Authenticates against the server.
 * @returns {{ outcome: 'ok'|'invalid'|'error'|'unreachable', mustChangePassword?: boolean, message?: string }}
 */
export async function loginAdmin(password) {
  try {
    const { status, ok, data } = await post('/login', { password });

    if (ok) {
      return { outcome: 'ok', mustChangePassword: Boolean(data?.mustChangePassword) };
    }
    if (status === 401) {
      return { outcome: 'invalid', message: 'Password admin salah.' };
    }
    // 503 / 500 / anything else: the server answered but could not decide.
    return {
      outcome: 'error',
      message: data?.error || 'Layanan admin sedang tidak tersedia.',
    };
  } catch {
    // Network failure or the API is not deployed yet.
    return { outcome: 'unreachable' };
  }
}

/**
 * Rotates the admin password. The server also demands a valid session cookie
 * and the current password, so this cannot be called anonymously.
 * @returns {{ outcome: 'ok'|'invalid'|'error'|'unreachable', message?: string }}
 */
export async function changeAdminPassword(currentPassword, newPassword) {
  try {
    const { status, ok, data } = await post('/password', { currentPassword, newPassword });

    if (ok) return { outcome: 'ok' };
    if (status === 401 || status === 400) {
      return { outcome: 'invalid', message: data?.error || 'Password tidak dapat diubah.' };
    }
    return {
      outcome: 'error',
      message: data?.error || 'Layanan admin sedang tidak tersedia.',
    };
  } catch {
    return { outcome: 'unreachable' };
  }
}

/**
 * Ends the server session by expiring the cookie. Best-effort: the client
 * clears its own logged-in state regardless of the result.
 */
export async function logoutAdmin() {
  try {
    await fetch(`${BASE}/logout`, { method: 'POST', credentials: 'same-origin' });
  } catch {
    // Ignored on purpose — local logout must never be blocked by the network.
  }
}
