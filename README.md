# 2akinoStore

React storefront for digital subscriptions and services. Products and
categories are served from MongoDB through server-side API routes. Transactions
and non-secret store settings remain browser-local.

## Run locally

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

`npm run dev` starts the Vite frontend only. To use the MongoDB-backed catalog
and admin APIs locally, configure the server-only variables in `.env.local`
(see [MongoDB catalog and admin credentials](#mongodb-catalog-and-admin-credentials))
and start the app with the Vercel development runtime:

```sh
npx vercel dev
```

This serves both the frontend and the `api/` serverless functions. Do not add
MongoDB credentials or `ADMIN_SESSION_SECRET` to any `VITE_` variable.

Run the unit tests and production build before pushing changes:

```sh
npm test
npm run build
```

GitHub Actions runs both checks on every push to `main`. See
[CICD.md](./CICD.md) for the repository's single-branch (`main`) commit and
push workflow.

## Admin catalog guide

Open **Admin** in the navigation and sign in. The starter password is seeded
on the server; change it in **Pengaturan** before using the site. Catalog CRUD
is protected by server-validated admin sessions and changes are shared through
MongoDB. Transactions and the store WhatsApp number are still browser-local.

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

WeTV replaces the former YouTube catalog branding. Existing browser-saved
YouTube categories and products are converted to WeTV during the explicit
legacy catalog import.

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
guides are stored with their category or product in MongoDB. Editing one
product's or category's guide never changes another's. The resolution rules
live in `src/lib/guides.js` and are covered by unit tests.

Guides are served as part of the public MongoDB catalog, so they are shared
with customers on every device.

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

## MongoDB catalog and admin credentials

MongoDB Atlas stores categories, products, stock, and purchase guides alongside
the admin credential. Catalog documents live in the `categories` and
`products` collections; the admin password is a salted scrypt hash in
`admin_credentials`. Only the Vercel API functions connect to the database.
Transactions and the WhatsApp setting continue to use browser `localStorage`.

Credentials live in `.env` / `.env.local` (both gitignored). Copy `.env.example`
and fill it in, or paste the values from the Atlas onboarding screen:

- `.env` is read by `scripts/test-mongodb.mjs`, which parses it itself.
- `.env.local` is used by `npx vercel dev` to configure the API functions
  locally. Plain `npm run dev` does not serve API routes.

```
MONGODB_USERNAME="your_db_user"
MONGODB_PASSWORD="your_db_password"
MONGODB_URI="mongodb+srv://your_db_user:your_db_password@your-cluster.xxxxx.mongodb.net"
```

Run the connection check with:

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
> machine. `.env` is gitignored. Rotate any credential that has been shared or
> exposed, then supply the replacement only through the host's secret manager
> and the local ignored environment file. Configure Atlas Network Access for
> the deployment host rather than a broad range.

### Catalog loading and legacy import

The storefront fetches `GET /api/catalog` from MongoDB. It shows a loading
state while the request is pending, a retryable error state if the API or
database is unavailable, and an explicit empty-catalog state if no products
have been added.

When MongoDB returns an empty catalog, an authenticated admin can choose
**Impor katalog lama** in the dashboard. The import reads this browser's
existing `2akinostore_cats_v12` and `2akinostore_products_v12` data (or the
starter catalog if no saved catalog exists), validates it on the server, and
uses stable IDs with insert-only upserts. Repeating an interrupted import is
safe; existing documents are not overwritten. The previous browser copies are
left intact as a recovery source, but subsequent catalog changes are written
only to MongoDB.

Protected catalog APIs cover product and category creation, editing, and
deletion, guide and stock updates, and atomic stock decrement during manual
payment verification. The API validates all fields and rejects category
deletion while products still reference it. Admin routes require the
server-validated `HttpOnly` session cookie; database access never runs in the
browser.

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

The storefront keeps interactions smooth on desktop and mobile by avoiding
avoidable work:

- The bundled static QRIS image is optimized to a fraction of its former size.
  Keep `DANA.jpeg` scannable when it is replaced: the app reads its payload with
  ZXing, so the QR must remain legible after any resize or recompression.
- The QRIS payload is decoded only when a customer starts a checkout, not on
  page load, so the ZXing decoder is not part of the initial render cost.
- The MongoDB catalog is fetched once on load. Catalog cards, the hero, and the
  service highlights are memoized so typing in search or editing admin fields
  does not re-render unrelated markup.
- Product cards fade in with a CSS animation instead of a JavaScript-driven
  effect, and the decorative shimmer/aurora animations pause while the tab is
  hidden.
- Catalog and admin search group products in a single pass instead of rescanning
  the catalog once per category.
