# 2akinoStore

React storefront for digital subscriptions and services. The catalog and admin
settings are stored in the browser's `localStorage`.

## Run locally

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Run the unit tests and production build before pushing changes:

```sh
npm test
npm run build
```

GitHub Actions runs both checks on every push to `main`. See
[CICD.md](./CICD.md) for the repository's single-branch (`main`) commit and
push workflow.

## Admin catalog guide

Open **Admin** in the navigation and sign in. The current starter password is
`0987654321`; change it in **Pengaturan** before using the site. Admin access,
passwords, catalog data, and payment status are browser-local and are not
server-side authentication or shared between devices.

In **Daftar produk**:

- Search products by name, category, or duration.
- Set stock to a non-negative whole number and save it. A stock of `0` marks a
  product as sold out and disables checkout.
- Leave stock empty to mark it unlimited. Products saved before stock
  management was introduced remain unlimited, so the update does not
  unintentionally stop existing sales.
- A finite-stock item is decremented when an admin manually verifies its
  payment. Verification is blocked if the stock has reached zero.
- Categories with products cannot be deleted. Remove those products first;
  deleting an empty category requires confirmation.
- Add a **panduan pembelian** (purchase guide) for a whole category and for
  individual products. See below.

WeTV replaces the former YouTube catalog branding. Existing saved YouTube
categories and products are migrated to WeTV when the app loads.

## Panduan pembelian (purchase guide)

Customers see a purchase guide in the checkout dialog, above the name and
WhatsApp fields, before they continue to payment. Every category and every
product has its own guide field in the admin dashboard, edited inline:

- A **product guide** is typed in the product's card, under its stock field.
- A **category guide** is typed at the top of that category's section and
  applies to every product in the category that has no guide of its own.

Resolution order is **product first, then category**:

1. If the product has a guide, that text is shown.
2. Otherwise the guide of the product's category is shown.
3. If neither is set, the guide section is not rendered at all. Blank fields
   are never replaced with sample or placeholder content.

Guides are plain text. They are rendered as text nodes, so markup typed into a
guide is displayed literally and cannot execute. Line breaks are preserved, and
the panel wraps inside the dialog without horizontal scrolling on a 390px-wide
phone.

Saving a guide updates the checkout flow immediately with no redeploy, because
guides are stored with the catalog in `localStorage` under the existing
`2akinostore_cats_v12` and `2akinostore_products_v12` keys. Editing one
product's or category's guide never changes another's. The resolution and
update rules live in `src/lib/guides.js` and are covered by unit tests.

Because storage is browser-local, guides set on one device are not shared with
customers on other devices. Publishing a guide to every visitor, like the rest
of the catalog, requires a backend.

## QRIS operating hours

QRIS checkout is only available every day from 07:00 WIB (inclusive) until
20:00 WIB (exclusive). Outside that window the buy button is disabled, the QR
payload is not generated, and a notice explains when the store reopens:

> Pembayaran QRIS hanya tersedia pukul 07.00–20.00 WIB. Silakan kembali saat jam operasional.

The rule is anchored to the `Asia/Jakarta` timezone, not the visitor's device
clock, so it behaves the same for customers in any timezone. Admin manual
verification is deliberately **not** restricted: an admin may confirm a payment
that genuinely arrived during operating hours.

**This check is advisory.** The rule lives in `src/lib/operatingHours.js` and is
enforced at every QRIS entry point in the app, but this is a static site with no
server, so a user who edits the page in their browser can bypass it. Treat it as
a usability guardrail, not a security control. Enforcing the window so it
cannot be bypassed requires a backend that validates transactions server-side;
`assertQrisOpen()` is kept pure and free of browser APIs so that a future server
can call the exact same function.

## QRIS payment limitation

Checkout creates a dynamic EMVCo QR payload locally from the configured static
QRIS image and inserts the exact order amount. The customer confirmation button
only records a pending order. An admin must check the merchant account and
manually verify receipt before marking the order paid. This static-site
implementation has no acquirer API, server-side webhook, automatic payment
status, or shared order database; do not treat browser-local verification as
provider-confirmed settlement.

## MongoDB (admin credentials)

The catalog, guides, transactions and settings still live in `localStorage`.
MongoDB Atlas now stores **one** thing: the admin credential. The password is
kept as a salted scrypt hash in the `admin_credentials` collection of the
`2akinostore` database, and the browser can no longer compare it locally.

Credentials live in `.env` / `.env.local` (both gitignored). Copy `.env.example`
and fill it in, or paste the values from the Atlas onboarding screen:

- `.env` is read by `scripts/test-mongodb.mjs`, which parses it itself.
- `.env.local` is read by `npm run dev` (Vite) and by the API functions when you
  run them locally.

```
MONGODB_USERNAME="your_db_user"
MONGODB_PASSWORD="your_db_password"
MONGODB_URI="mongodb+srv://your_db_user:your_db_password@your-cluster.xxxxx.mongodb.net"
```

Run the check with:

```sh
npm run test:mongodb
```

It resolves the SRV/TXT records, connects, pings, lists databases, and performs
a real insert / find / delete round-trip in a throwaway `2akinostore_check`
database, which it drops afterwards. It is intentionally excluded from
`npm test` and CI because it needs live credentials and network access.

The script resolves the `mongodb+srv://` records itself through a public
resolver (override with `MONGODB_DNS_SERVERS`). Many home routers answer the
SRV query but drop the TXT query, and because the driver needs both, the
connection hangs until it times out. Bypassing the router keeps the check
reliable. `mongodb` is a `devDependency` so it is never bundled into the
browser build.

Access follows the same rules as any Atlas cluster:

- The connecting machine's public IP must be in **Network Access → IP Access
  List**. Otherwise Atlas accepts the TCP and TLS handshake and then closes the
  socket without sending a MongoDB greeting, which the script reports as
  `connection <monitor> ... closed`.
- The database user must exist in **Database Access** and have read/write on
  the target database.

> **Security note:** credentials sit in a plaintext `.env` on the development
> machine. `.env` is gitignored and has never been committed. Before this
> project talks to MongoDB from a deployed environment, the password should be
> rotated and supplied through the host's secret manager, and the cluster's IP
> access list should name that host rather than a broad range.

### Admin login

The admin password is verified **on the server**, never in the browser:

1. `POST /api/admin/login` (Vercel Function) reads the credential document and
   compares the submitted password against the scrypt hash.
2. On success it sets an `HttpOnly`, `SameSite=Strict` session cookie signed
   with `ADMIN_SESSION_SECRET`.
3. `POST /api/admin/password` rotates the password. It requires a valid
   session **and** the current password, and it rewrites the hash in MongoDB —
   which is why a change now applies on every device instead of only the
   browser that submitted the form. The cookie embeds a fingerprint of the
   current hash, so rotating the password invalidates every other session.
4. `POST /api/admin/logout` expires the cookie.

The default password, seeded on first login, is `2akinostore`. Change it from
**Pengaturan** right away; the login endpoint reports `mustChangePassword`
until you do.

Because the browser never sees the hash or the connection string:

- `MONGODB_URI` and `ADMIN_SESSION_SECRET` are **server-only** environment
  variables. Never prefix them with `VITE_`, or Vite inlines them into the
  client bundle and publishes your database credentials.
- The client falls back to the legacy `localStorage` password only when the API
  is unreachable, so a rollout or an outage cannot lock the owner out. That
  fallback is browser-local and is not a security boundary.
- `api/` is excluded from `src/**/*.test.js`; its endpoints are exercised
  against a live cluster rather than in CI.

> **Migration note:** until the fallback is removed, the old browser-local
> password still grants access while the API is offline. Delete the `adminPass`
> entry from `2akinostore_settings_v12` once every device has signed in through
> the API at least once.

## Performance notes

The storefront keeps interactions smooth on desktop and mobile by staying
browser-local and avoiding avoidable work:

- The bundled static QRIS image is optimized to a fraction of its former size.
  Keep `DANA.jpeg` scannable when it is replaced: the app reads its payload with
  ZXing, so the QR must remain legible after any resize or recompression.
- The QRIS payload is decoded only when a customer starts a checkout, not on
  page load, so the ZXing decoder is not part of the initial render cost.
- Catalog cards, the hero, and the service highlights are memoized so typing in
  search or editing admin fields does not re-render unrelated markup.
- Product cards fade in with a CSS animation instead of a JavaScript-driven
  effect, and the decorative shimmer/aurora animations pause while the tab is
  hidden.
- Catalog and admin search group products in a single pass instead of rescanning
  the catalog once per category.

