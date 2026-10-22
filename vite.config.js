import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Delivered through index.html rather than a hosting header so the policy also
// applies in `vite preview` and on hosts without header support. It is
// production-only: the dev server needs inline scripts for React Fast Refresh.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

function contentSecurityPolicy() {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: CONTENT_SECURITY_POLICY,
            },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  build: {
    // Split the long-lived vendor code away from the app code so a store
    // change does not invalidate the React/dialog/QR chunks in the browser
    // cache. The QR and scanner chunks are only fetched when a checkout
    // reaches the payment step.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('qrcode.react')) return 'vendor-qr';
          if (id.includes('@zxing')) return 'vendor-scan';
          if (id.includes('react-dom') || id.includes('scheduler') || id.includes('/react/')) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
});
