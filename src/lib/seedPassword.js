/**
 * Password used only to seed the very first admin credential in MongoDB.
 *
 * Kept in its own module so `src/lib/password.js` (which is imported by the
 * browser bundle for nothing more than hash helpers) never carries the
 * plaintext default. Vite only bundles modules reachable from the client
 * entry point, and no client module imports this file, so the value stays
 * server-side. The admin is forced to change it right after the first login.
 */
export const SEED_ADMIN_PASSWORD = '2akinostore';
