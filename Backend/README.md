# Fashion — Backend API

REST API for Fashion (dress shop management software): master data — categories, brands, sizes,
colours, suppliers, customers, and products with variants — sign-in and users, and counter
billing (GST bills with barcode lookup).

Node.js · Express 5 · TypeScript · PostgreSQL (raw SQL with `pg`) · Zod · Swagger UI

## Quick start

Requirements: Node.js ≥ 20.19 (tested on 24.2) and PostgreSQL ≥ 13 (tested on 17).

```bash
npm install
# 1. Edit .env — at least DB_PASSWORD (copy .env.example if .env is missing)
# 2. Create the database, apply migrations and load demo data:
npm run db:setup
# 3. Start the API with auto-reload:
npm run dev
```

- API: http://localhost:3000/api/v1
- Swagger UI: http://localhost:3000/api/docs (raw spec: `/api/docs/openapi.json`)
- Health: http://localhost:3000/api/v1/health

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload (tsx watch) |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm run db:create` | Create the database named in `DB_NAME` if it does not exist |
| `npm run db:migrate` | Apply pending SQL migrations (`npm run db:migrate:prod` after a build). On a database with no users it also creates the default login **admin / admin@123** (change it at first sign-in; override with `ADMIN_INITIAL_PASSWORD`) |
| `npm run migrate <name>` | Apply **only** one screen's migration, e.g. `npm run migrate purchase-entry` (or its number: `npm run migrate 7`; several: `npm run migrate purchase-order purchase-entry`). Names may be singular or plural with `-`, `_` or spaces; screen names such as `barcode-assign`, `items`, `users`, `masters`, `stock-adjustment` (or `adj`) also work (`database/migrations/select-migrations.ts`). Already applied → nothing to do; other pending migrations are listed but not applied. If it needs tables of an earlier pending migration it is rolled back and says which to apply first |
| `npm run migrate status` | List every migration with when it was applied, or PENDING |
| `npm run db:seed` | Load demo data (idempotent — safe to re-run) |
| `npm run db:setup` | `db:create` + `db:migrate` + `db:seed` |
| `npm test` | Integration + unit tests against `<DB_NAME>_test` (created automatically) |
| `npm run typecheck` | TypeScript check of src, database and tests |
| `npm run format` | Prettier |

## Configuration (`.env`)

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | |
| `CORS_ORIGINS` | `http://localhost:4200` | Comma-separated; `*` allows any origin |
| `LOG_REQUESTS` | `true` | One log line per request |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | |
| `DB_USER` / `DB_PASSWORD` | `postgres` / — | |
| `DB_NAME` | `fashion` | Letters, digits and underscores only |
| `TEST_DB_NAME` | `<DB_NAME>_test` | Database used by `npm test` (wiped on every run) |
| `DB_POOL_MAX` | `10` | |
| `DB_SSL` | `false` | Encrypt the connection (needed for cloud databases such as Aiven) |
| `DB_SSL_CA` | — | With `DB_SSL=true`: CA certificate file (PEM, e.g. Aiven's `ca.pem`) the server is verified against. Empty = encrypted but not verified |

Environment variables override `.env`. The configuration is validated at start-up.

## Architecture

```
src/
  config/        env (validated), database (pg Pool + withTransaction), swagger (OpenAPI builder)
  common/
    crud/        Generic master repository / service / controller / standard routes
    errors/      AppError, PostgreSQL error translation, constraint → message map
    http/        Route definitions: routing + validation + docs from one declaration
    middlewares/ validateRequest, errorHandler, notFoundHandler, requestLogger
    utils/       Pagination, sorting allowlist, SQL parameter builder, responses, logger
    validators/  Zod fields (mobile, GSTIN, pincode, HSN, HEX, money…), list/exists queries
  modules/<name>/  <name>.routes → .controller → .service → .repository (+ .schema)
  modules/products/variants/   Variant sub-resource
  app.ts, routes.ts, server.ts
database/
  migrations/    NNN_name.sql + migrate.ts (tracked in schema_migrations, checksummed)
  seeds/         seed-data.ts + seed.ts (idempotent)
tests/           node:test suites (api + unit) and the test harness
```

- **Routes → Controllers → Services → Repositories.** Repositories contain all SQL; services hold
  business rules; controllers map validated HTTP input to services.
- **Raw, parameterised SQL** only (`$1, $2…`). Sort fields are allowlisted, `LIKE` wildcards in
  search terms are escaped, and identifiers in SQL text are developer constants.
- **Integrity is enforced in PostgreSQL** (case-insensitive unique indexes, foreign keys with
  `ON DELETE RESTRICT`, CHECK constraints) and pre-checked in services for clear messages.
  Constraint names map to user-facing messages in `common/errors/constraint-messages.ts`.
- **One definition per endpoint**: `defineRoute({ method, path, schemas, handle, … })` registers the
  Express route, validates params/query/body with Zod, and generates the Swagger docs.

## API conventions

**Envelope**

```jsonc
// success
{ "success": true, "data": { … } }
// list
{ "success": true, "data": { "items": [ … ], "total": 42, "page": 1, "pageSize": 10, "totalPages": 5 } }
// error
{ "success": false, "error": { "code": "DUPLICATE", "message": "…", "field": "variants.2.sku", "details": [ … ] } }
```

`DELETE` returns `204 No Content`.

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION` | Invalid params/query/body; `details` lists every problem with its field path |
| 400 | `BAD_REQUEST` | Malformed JSON |
| 404 | `NOT_FOUND` | Record or route not found |
| 409 | `DUPLICATE` | Unique value already used (name, mobile, GSTIN, product code, SKU, barcode…) |
| 409 | `IN_USE` | Delete blocked because other records reference it — deactivate instead |
| 503 | `SERVICE_UNAVAILABLE` | Database unreachable |

**List query:** `?search=&status=active|inactive&page=1&pageSize=10&sortBy=name&sortOrder=asc`
plus resource filters (sizes: `type`; suppliers: `state`; products: `categoryId`, `brandId`,
`productType`). Search matches every word. Empty values (e.g. `status=`) are ignored.

## Endpoints (`/api/v1`)

Masters — `categories`, `brands`, `sizes`, `colors`, `suppliers`, `customers` — share one shape:

| Method | Path | |
| --- | --- | --- |
| GET | `/{resource}` | Paginated list |
| GET | `/{resource}/lookup?status=` | All records (dropdowns) |
| GET | `/{resource}/exists?field=&value=&excludeId=` | Live duplicate check |
| GET | `/{resource}/{id}` | Details |
| POST | `/{resource}` | Create |
| PUT | `/{resource}/{id}` | Update (full replacement) |
| PATCH | `/{resource}/{id}/status` | `{ "status": "active" \| "inactive" }` |
| DELETE | `/{resource}/{id}` | Delete (409 `IN_USE` if referenced) |

Products:

| Method | Path | |
| --- | --- | --- |
| GET | `/products` | Paginated summaries (category/brand names, `variantCount`; no variants) |
| GET | `/products/lookup`, `/products/exists?field=code\|sku\|barcode` | |
| GET | `/products/{id}` | Product **with variants** (size/colour names and HEX included) |
| POST | `/products` | Create product + variants in one transaction |
| PUT | `/products/{id}` | Update product and **sync variants** (with `id` → update, without → add, missing → delete) |
| PATCH / DELETE | `/products/{id}/status`, `/products/{id}` | Delete also removes its variants |
| GET / POST | `/products/{productId}/variants` | List / add one variant |
| GET / PUT / DELETE | `/products/{productId}/variants/{variantId}` | One variant |

Business rules: product code, SKUs and barcodes are unique across the whole catalogue (product and
variant barcodes share one namespace); selling price ≤ MRP after variant overrides; one variant per
design + size + colour within a product; new records cannot use inactive categories / brands /
sizes / colours (existing references are kept). Concurrent product saves are serialised with a
PostgreSQL advisory lock so codes can't be claimed twice.

Items, barcodes and labels:

| Method | Path | |
| --- | --- | --- |
| GET | `/items?search=&status=&categoryId=&brandId=&sizeId=&colorId=&barcode=missing\|assigned&page=&pageSize=&sortBy=&sortOrder=` | Items = one row per variant, or per product without variants (same shape as the billing scan results, plus the category). Variants of a product stay together in their own order |
| GET | `/items/counts` | `{ total, active, missingBarcode }` (missing = active items without a barcode) |
| POST | `/items/barcodes` | Give items a barcode `{ items: [{ productId, variantId, barcode, replace }] }` — `barcode: ''` generates the shop's next number |
| GET / PUT | `/settings/barcodes` | Barcode prefix, next number and the label layout / fields (PUT is admin-only) |

Barcode rules: shop barcodes are EAN-13 numbers in the GS1 in-store range — prefix (200–299) +
9-digit running number + check digit, e.g. `2000000000015` (`src/modules/items/shop-barcode.ts`,
mirrored in the frontend) — so they never clash with a maker's barcode. The counter row
(`barcode_settings`) is locked by the saving transaction and numbers already on an item are
skipped; it is never reset (changing the prefix continues the numbering). A save is all or
nothing and runs under the same catalogue-codes advisory lock as product saves: a typed barcode
must be unique in the request and the catalogue (409 `DUPLICATE`, field `items.N.barcode`), an
item that already has a barcode needs `replace: true`, and a product with variants needs the
variant. Everyone signed in may assign barcodes; only administrators change the settings.

Shop profile and billing:

| Method | Path | |
| --- | --- | --- |
| GET / PUT | `/settings/shop` | Shop profile printed on bills (PUT is admin-only) |
| GET | `/sales/items/lookup?code=` | Scanner: exact variant barcode / SKU, product barcode / code (a product code returns all its variants; inactive items are flagged) |
| GET | `/sales/items?search=&limit=` | Typed search over active items (name, code, SKU, barcode, design, brand, size, colour) |
| POST | `/sales/invoices` | Save a bill `{ customerId?, items: [{ productId, variantId, quantity, discountPercent, unitPrice }], payments: [{ mode, amount, reference }] }` |
| GET | `/sales/invoices?date=&from=&to=&search=` | Bills, newest first (`from` / `to` = YYYY-MM-DD, both included) |
| GET | `/sales/invoices/{id}` | One bill with lines and payments (for printing) |

Billing rules: prices are GST-inclusive; the server recomputes every line (discount → taxable value
→ CGST + SGST, or IGST for a registered customer from another state) and rounds the bill to the
rupee (`src/modules/sales/bill-calculator.ts`, mirrored in the frontend). A bill is refused when an
item is inactive, its price changed since it was added (`items.N.unitPrice`), a non-fabric quantity
has decimals, or the payments don't cover it (only cash may exceed the bill — the rest is change).
Bills are numbered `INV/<financial year>/<n>` (e.g. `INV/26-27/00001`) without gaps: the counter
row is locked by the saving transaction. Bills keep a snapshot of the seller, customer and items,
and are never deleted, so billed products, variants, customers and users are protected by RESTRICT
foreign keys (409 `IN_USE` — deactivate them instead).

Purchase orders (administrators only):

| Method | Path | |
| --- | --- | --- |
| GET | `/purchase-orders/items/lookup?code=` · `/purchase-orders/items?search=&limit=` | Scanner / typed search like billing, plus `purchasePrice` (variant override, else product; never exposed on `/sales/*`) |
| GET | `/purchase-orders/next-number?date=` | Preview of the next number (not reserved) |
| GET | `/purchase-orders?search=&status=&supplierId=&from=&to=&page=&pageSize=` | POs, newest first |
| GET | `/purchase-orders/{id}` | One PO with its lines |
| POST | `/purchase-orders` | Create `{ supplierId, poDate, expectedDate?, notes?, items: [{ productId, variantId, quantity, rate, discountPercent }] }` |
| PUT | `/purchase-orders/{id}` | Change an open PO (nothing received yet); the number stays |
| POST | `/purchase-orders/{id}/cancel` | Cancel an open PO (kept, never deleted) |

PO rules: rates are GST-exclusive — CGST = SGST = taxable × GST/2 % (same state as the shop) or
IGST = taxable × GST % (supplier in another state, from its GSTIN), total rounded to the rupee
(`src/modules/purchase-orders/po-calculator.ts`, mirrored in the frontend). Numbers are
`PO-<year the April–March financial year starts>-<5 digits>` (e.g. `PO-2026-00001` for April 2026 –
March 2027) without gaps (`document_counters`, locked by the saving transaction). Refused: inactive
supplier or item, future PO date, expected date before the PO date, the same item on two lines,
decimal quantities for non-fabric items, and moving the PO date into another financial year.
Statuses: `open` → `partial` / `received` (set by Purchase Entry) or `cancelled`; lines keep
the `received_quantity` of saved purchase entries. A PO can be edited or cancelled only while
nothing has been received. Suppliers, products and variants on a PO can't be deleted
(409 `IN_USE`). The line checks are shared with purchase entries
(`src/modules/purchase-orders/purchase-lines.ts`).

Purchase entries — goods received, entered from the supplier's invoice (administrators only):

| Method | Path | |
| --- | --- | --- |
| GET | `/purchase-entries/next-number?date=` | Preview of the next number (not reserved) |
| GET | `/purchase-entries/orders?supplierId=` | Open / partly received POs to receive against (all suppliers, or one) |
| GET | `/purchase-entries/orders/{poId}` | A PO as items to receive: each line with the item as it is now (prices, status), ordered and received so far |
| GET | `/purchase-entries?search=&status=&supplierId=&purchaseOrderId=&from=&to=&page=&pageSize=` | Entries, newest first (search: PE no, supplier, supplier invoice no, PO no) |
| GET | `/purchase-entries/{id}` | One entry with its lines (`orderedQuantity` = quantity on the linked PO) |
| GET | `/purchase-entries/{id}/labels` | The entry's items as they are now with `copies` = received quantity (1 for fabric), for Barcode Assign |
| POST | `/purchase-entries` | Save `{ supplierId, purchaseOrderId?, supplierInvoiceNo, supplierInvoiceDate, entryDate, billAmount?, notes?, items: [{ productId, variantId, quantity, rate, discountPercent, mrp?, sellingPrice? }] }` |
| PUT | `/purchase-entries/{id}` | Change a saved entry; the number stays and PO quantities follow |
| POST | `/purchase-entries/{id}/cancel` | Cancel (kept, never deleted; no longer counts as received) |

Purchase entry rules: same GST-exclusive maths as POs (`po-calculator.ts`). Numbers are
`PE-<financial year start>-<5 digits>` (series `PE` in `document_counters`). The received date
can't be in the future and the supplier invoice date can't be after it; the same supplier invoice
number is refused (409 `DUPLICATE`) when already entered for that supplier in the financial year
(cancelled entries don't count). A PO must belong to the same supplier, not be cancelled, and still
have something to come — unless the entry already belongs to it. Receiving more than ordered is
allowed. After every save / edit / cancel the PO's `received_quantity` is recomputed from its saved
entries (lines matched by item) and its status set to `open` / `partial` / `received`. Saving also
gives each item the entry's rate as its purchase price and the entry's MRP / selling price
(selling price ≤ MRP; omitted = unchanged): a variant gets its own override, a product without
variants new product prices — only where they differ. Cancelling does not undo prices. Received
goods enter stock (see Stock below).

Stock (any signed-in user):

| Method | Path | |
| --- | --- | --- |
| GET | `/stock/history?productId=&variantId=&limit=` | An item's stock movements, newest first, each with the balance after it, plus the quantity in hand |
| POST | `/stock/levels` | Quantity in hand of up to 1000 items `{ items: [{ productId, variantId }] }`, in the order given (screens refreshing what they show) |

Every item also carries `stock` (quantity in hand) on `/items`, `/sales/items*`,
`/purchase-orders/items*` and `/purchase-entries/orders/{id}`; `/items` can be filtered with
`stock=in|out|negative` and sorted by `stock`, and `/items/counts` has `belowZero`.

Stock rules (migration `008_stock.sql`, `src/modules/stock`): `stock_movements` is the ledger — one
row per item per document line: + for purchase entries (with the GST-exclusive unit cost after
discount), − for bills, ± for stock adjustments; `stock_levels` holds the quantity
in hand per item, recomputed from the ledger in the same transaction. Saving, editing or cancelling
a purchase entry, saving a bill and saving / cancelling a stock adjustment replace that document's
movements (`StockService.record` /
`remove`); items are locked in key order (transaction advisory locks), so concurrent bills keep the
count right. Selling more than is in stock is allowed — the stock goes below zero (goods sold before
being entered). `SELECT rebuild_stock();` recreates the ledger and levels from the documents (the
migration runs it once, so existing entries and bills count from the start; since migration 009 it
rebuilds stock adjustments too).

Stock adjustments (administrators only; migration `009_stock_adjustments.sql`,
`src/modules/stock-adjustments`; `npm run migrate stock-adjustment`):

| Method | Path | |
| --- | --- | --- |
| GET | `/stock-adjustments/next-number?date=` | Preview of the next number (`ADJ-2026-00001`, series `ADJ`, per April–March year) |
| GET | `/stock-adjustments/items?categoryId=&brandId=&stock=&status=&limit=` | Items to load in one go (a category / brand to count, `stock=negative` for below zero) with stock and purchase price |
| GET | `/stock-adjustments?search=&reason=&status=&from=&to=&page=&pageSize=` | List, newest first |
| GET | `/stock-adjustments/{id}` | One adjustment with its lines |
| POST | `/stock-adjustments` | Save `{ adjustmentDate, mode, reason, notes, items }` |
| POST | `/stock-adjustments/{id}/cancel` | Cancel (kept, stock changes reversed) |

Rules: `mode` is `count` (each line has `countedQuantity`; the change is counted − in stock at save
time) or `change` (each line has a signed `quantity`, not 0). Reasons: `opening_stock`,
`stock_count`, `damaged`, `lost`, `found`, `other` (needs notes); damaged / lost may only take
stock out and found only add it. In count mode a line may send `systemQuantity` (the stock the screen
showed): if the stock has moved since (a bill or entry was saved meanwhile) the save is refused with
a 400 whose `field` / `details` name each `items.N.systemQuantity`, so the count can be checked.
Lines keep the stock before, the count, the change, `unitCost` (GST-exclusive cost of one piece,
from the purchase price, optional) and `value` = change × cost. Inactive items can be adjusted
(write-offs). Adjustments are never edited or deleted — cancel and enter again. Items are scanned /
searched with `/purchase-orders/items`.

Reports (administrators only):

| Method | Path | |
| --- | --- | --- |
| GET | `/reports/sales?from=&to=` | Sales of a period: `totals` plus one row per day that had sales (`days`, oldest first) — bills, quantity, gross, discount, taxable value, CGST / SGST / IGST, round-off, net sales, average bill, and the cash / UPI / card split |

Report rules: periods use the shop-local bill date, include both ends and may be at most 366 days.
Only `completed` bills count (cancelled bills drop out automatically once cancellation exists).
Cash is net of change returned, so cash + UPI + card = net sales. Sums are done in SQL `NUMERIC`
(exact to the paisa); one `GROUP BY ROLLUP` query returns the days and the total
(`src/modules/reports/reports.repository.ts`).

## Connecting the Angular frontend

The frontend uses this API by default (`Frontend/src/app/core/data-access/http`). In development
the Angular dev server proxies `/api` to `http://localhost:3000` (`Frontend/proxy.conf.mjs`), so
start this backend first, then `npm start` in `Frontend`. The client maps:

- list query `sort` → `sortBy` / `sortOrder`; `status: ''` → omitted;
- `getAll()` → `GET /{resource}/lookup`; `isTaken()` → `GET /{resource}/exists`;
- `setStatus()` → `PATCH /{resource}/{id}/status`;
- products: `brandId: null` (unbranded) ↔ the frontend's `''`; list rows have `variantCount` but
  no `variants`.

## Not in this phase

Stock value and the stock report, purchase returns, supplier payments, sales returns / exchanges, bill
cancellation, credit sales and wholesale orders.
