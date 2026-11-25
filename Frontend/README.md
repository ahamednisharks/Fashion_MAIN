# Fashion — Frontend

Dress shop management software. This package contains the Angular frontend.

**Built so far:** master data (Categories, Brands, Sizes, Colors, Suppliers, Customers, Products
with variants), **Items** and **Barcode Assign** (barcodes + price labels), sign-in / users,
**Billing** (counter billing with barcode scanning), **Purchase Orders**, **Purchase Entry**, stock
with **Stock Adjustment** and the **Sales Report**. The other reports (customer-wise sales,
purchase, stock) are navigation placeholders only.

## Requirements

- Node.js `^20.19`, `^22.12` or `>=24` (tested with 24.2.0) and npm 11
- Angular CLI 21 is installed locally — no global install needed (`npx ng …`)

## Commands

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Start dev server (http://localhost:4200, proxies `/api` → backend on :3000) | `npm start` |
| Start dev server reachable from phones on the LAN | `npm run start:lan` |
| Production build (output: `dist/fashion`) | `npm run build` |
| Unit tests (Vitest, single run) | `npx ng test --watch=false` |
| Regenerate the SVG icon registry | `npm run icons` |

> If `npm install` fails with `Cannot read properties of null (reading 'edgesOut')`, that is a
> known npm 11.3 bug; upgrading npm (`npm i -g npm@latest`) resolves it.

## Tech stack

Angular 21 (standalone components, signals, zoneless change detection, new control flow),
TypeScript (strict), Reactive Forms, SCSS. Icons are inline SVGs generated from
`bootstrap-icons` at dev time (no icon font). No UI framework — a small custom design system
lives in `src/styles`.

## Project structure

```
src/
  styles/                 Design system: tokens, mixins, buttons, forms, tables, modal…
  app/
    core/
      constants/          Indian states + GST state codes
      data-access/        Services per master + data-source contract (+ mock/ backend)
      layout/             Shell, sidebar, header, navigation config
      models/             Entity interfaces (one file per master)
      services/           Toasts, confirm dialog, layout, page title/breadcrumbs, CRUD flows
      utils/              GSTIN checksum, SKU builder, size ordering, storage, text helpers
    shared/
      barcode/            EAN-13 / Code 128 encoders + <app-barcode> (SVG)
      components/         Data table, list toolbar, pagination, modal, form field,
                          segmented control, detail list, status badge, empty/error states…
      forms/              Validators, messages, submit helpers, input directives
      guards/             Unsaved-changes guard
      list/               List controller (URL-synced list state) + master page helper
    features/
      barcodes/           Barcode Assign: worklist store, price label, label sheet (print)
      billing/            Counter billing: scan box, bill table, customer, payment, receipt
      purchase/           orders/ and entries/ (list, form, A4 view / print), shared/ supplier picker
      dashboard/
      masters/            categories, brands, sizes, colors, suppliers, customers, products, items
      reports/            Sales report (period presets, day-wise / bill-wise, CSV, A4 print)
      stock-adjustment/   Opening stock / counts / damage: list, form (store), A4 view, PDF
      settings/
      placeholders/       Coming soon / not found
```

## Data access — backend API

Master data comes from the **Fashion REST API** (`../Backend`, Express + PostgreSQL).

1. Start the backend first (`cd ../Backend && npm run dev`, port 3000 by default).
2. `npm start` here. The dev server proxies `/api/*` to the backend (`proxy.conf.mjs`), so the
   browser calls `/api/v1/...` on its own origin — no CORS setup needed. To use another backend
   address: `API_PROXY_TARGET=http://localhost:3100 npm start` (PowerShell:
   `$env:API_PROXY_TARGET='http://localhost:3100'; npm start`).
3. **Settings → Server connection** shows whether the API and database are reachable. If the
   backend is down, lists show "Unable to reach the server" with a retry button.

How it fits together: components never touch data directly. Each master has a service in
`core/data-access` (`CategoryService`, `ProductService`, …) exposing Observable-based CRUD —
`list(query)`, `getAll()`, `getById()`, `create()`, `update()`, `setStatus()`, `remove()`,
`isTaken()`. Services get their implementation from `DATA_SOURCE_FACTORY`, chosen in
`app.config.ts` by `provideDataSource('api' | 'mock')`:

- **`'api'`** (default) — `core/data-access/http`: maps list queries to
  `?search&status&page&pageSize&sortBy&sortOrder&<filters>`, unwraps the `{ success, data }`
  envelope, and converts API errors into `ApiError` (`code` + `field`, e.g. `variants.2.sku`) so
  forms highlight the right field.
- **`'mock'`** — in-browser demo data in `localStorage` (no backend). Settings then shows
  demo-data tools: reset sample data and *Simulate API errors*.

The shop profile (Settings) is stored on the server (`/settings/shop`, editable by administrators)
and printed on every bill. In `'mock'` mode it stays in the browser, and Billing is unavailable
(bills must be numbered and stored by the server).

## Items (`/masters/items`) and Barcode Assign (`/masters/barcodes`)

- **Items** — one row per size / colour variant (or per product without variants), i.e. exactly
  what billing scans. Search name / SKU / barcode / design no.; filter by barcode (missing /
  assigned), category, brand, size, colour and status; sort by name, SKU, barcode, MRP or price.
  The counts line links to the items *without a barcode*. Tick items (kept across pages) and choose
  **Barcodes & labels** to open them in Barcode Assign; each row also has *Print labels / Give a
  barcode* and *Edit* (opens the product form with that variant highlighted, `?variant=`).
- **Barcode Assign** — build a list with the Billing scan box (same item again = one more label),
  *Add all items without a barcode* (optionally by category / brand), or from the Items screen.
  Leave a row's barcode box empty to get the shop's next number (`200…`, EAN-13), or scan the
  maker's barcode into it (Enter jumps to the next row). Format and duplicates are checked as you
  type; **Save barcodes** is all or nothing and server errors land on their row. Items that already
  have a barcode can be changed (*Change* — old tags stop scanning). Leaving with rows still
  waiting for a barcode asks first.
- **Labels** — 50 × 25 mm roll (default), 38 × 25 mm roll two across, or A4 sheet of 65
  (38.1 × 21.2 mm, *start at label N* to reuse a part-used sheet). Choose what is printed (shop
  name, product, design · size · colour, MRP incl. of all taxes, selling price when lower); a 2×
  preview shows the first label. Administrators can *Save as default* and change the barcode
  prefix. Printing (`label-sheet.ts`, `print-labels` in `styles/_print.scss`) sets the page to the
  label size with no margins — in the print dialog pick the label printer, margins *None*, scale
  100%. *Print one test label* checks alignment.
- **Barcodes** are drawn as SVG by `shared/barcode/` (no library): valid EAN-13 numbers print as
  EAN-13, anything else as Code 128 (exactly the stored text, so a scanner reads back what billing
  looks up). The encoders were checked against an independent implementation.

## Billing (`/billing`)

- **Adding items** — scan a barcode (the scanner types the code + Enter) or type a name / SKU /
  design number and click a row in the list (rows, never cards). Enter on a product code lists its
  sizes / colours. **Adding the same item again increases that line's quantity.** Scans made while
  focus is elsewhere on the page are sent to the scan box; failed scans beep.
- **Bill table** — quantity (+ / − or typed; decimals only for fabric), discount % per line,
  remove. Totals show taxable value, CGST + SGST (IGST for a registered customer from another
  state) and round-off. Prices are GST-inclusive; `bill-calculator.ts` mirrors the backend.
- **Customer** — by mobile number (F4); unknown numbers can be saved with just a name; empty =
  walk-in.
- **Payment** — Cash (change shown), UPI, Card or Split. **F9** (or Ctrl+Enter) saves and prints an
  80 mm receipt (`receipt/`, print CSS in `styles/_print.scss`). *Today's bills* lists the day's
  bills for reprinting. Leaving the page with an unsaved bill asks first.

## Purchase orders (`/purchase/orders`, administrators only)

- **List** — newest first; search PO number / supplier, filter by status and PO date. View, edit
  (open POs) and print from each row.
- **New / edit** — pick an active supplier (search name, mobile, GSTIN or city; the tax type
  CGST + SGST or IGST is shown), PO date (not in the future) and optional expected date. Items are
  added with the Billing scan box (`ITEM_SOURCE` → `PurchaseOrderService`, so the list shows the
  *buy rate*); the same item again adds 1 to its quantity. Rate (GST exclusive, prefilled from the
  purchase price), quantity (decimals only for fabric) and discount % are edited on the line;
  totals use `po-calculator.ts`, which mirrors the backend. **F2** scan box, **Ctrl+S** save;
  leaving with unsaved changes asks first.
- **Numbers** — `PO-2026-00001` (year the April–March financial year starts in); a new PO shows
  the next number, given on save.
- **View / print** (`/purchase/orders/:id`) — A4 purchase order with shop and supplier details,
  lines, GST breakup, notes and signature line (`printPage()` in `shared/print`). *Save & Print*
  opens it with `?print=1`. Open POs can be edited or cancelled here; cancelled POs are kept.
- **Receive goods** (open / partly received POs) starts a purchase entry against the PO; once goods
  arrive the view shows a *Received* column and the entries made against the PO.

## Purchase entry (`/purchase/entries`, administrators only)

- **List** — newest first, fits the window (rows scroll inside the table); search PE no, supplier,
  supplier invoice no or PO no; filter by status and received date.
- **New / edit** — starts with the **Purchase order** list (every open / partly received PO, or
  the chosen supplier's; open POs are also offered as buttons on the empty item list). Choosing a
  PO (or *Receive goods* → `?po=<id>`) fills in the supplier and its items still to come with the
  PO's rate and discount — change what is different, then save; items already on the entry are
  replaced or kept (asked). Without a PO: choose the supplier and scan the items. Then the
  supplier invoice no and date and the received date. Each
  line shows "of N to come", **+N over PO** (allowed, amber) or *Not on PO*. Items are added with
  the Billing scan box like the PO form (*+ New product* opens the product form in a new tab for a
  design that isn't in the catalogue yet). Each line also has the **MRP** and **selling price** to give
  the item (prefilled from the item; "was …" when changed) and the margin on the selling price
  before GST. The optional **supplier bill total** is compared with the computed total. Totals use
  `po-calculator.ts`; **F2** scan, **Ctrl+S** save.
- **Save & print labels** saves, then opens Barcode Assign with the entry's items and one label per
  piece received (`LabelQueue` carries the copies; fabric gets one label).
- **View / print** (`/purchase/entries/:id`) — A4 purchase entry (supplier invoice, PO, lines with
  MRP / selling price, GST breakup, supplier bill check). Saved entries can be edited, cancelled
  (the PO goes back to waiting for the goods; prices stay) or sent to *Print labels*.
- The form shows each item's stock ("In stock 4 → after this entry 5"); saving adds the goods to
  stock, editing adjusts it, cancelling takes them out again.

## Stock

- **Items** has a **Stock** column (sortable; filter *In stock / Out of stock / Below zero*; the
  counts line links to items *below zero*). Clicking a quantity opens the item's **stock history**
  (`stock-history-dialog.ts`): date, document (purchase entries and stock adjustments link to the
  document for administrators), in, out and balance.
- The scan / search list (Billing, PO, PE, Barcode Assign) shows each item's stock.
- **Billing** reduces stock. Billing more than is in stock is allowed with an amber hint under the
  quantity ("Only 2 in stock" / "Not in stock") — goods may be in the shop but not entered yet.
- **Stock Adjustment** (Transaction → Stock Adjustment, administrators only; `features/stock-adjustment/`):
  - **List** (`/masters/stock-adjustment`) — newest first; search, reason, status and date filters;
    the table scrolls inside the page. Row actions: view, PDF, print.
  - **New** (`/masters/stock-adjustment/new`) — reason (Opening stock, Stock count, Damaged,
    Lost / stolen, Found, Other) and how quantities are entered: **Count** (type or scan what is
    there — each scan counts one piece; change = counted − in stock) or **Add / remove** (+ / −; for
    damaged / lost each scan takes one out). Picking a reason picks its usual mode; switching keeps
    what was entered. **Load items…** adds a whole category, brand, the items in stock or the items
    below zero (then Enter moves from one count to the next). Each line shows in stock, difference,
    stock after, cost (purchase price, editable) and value; totals show stock in / out and net value.
    `?reason=opening_stock`; `?preset=below-zero` (the Items screen's *Enter opening stock* link)
    loads every below-zero item. If a bill or entry moved an item's stock while counting, saving is
    refused, the stock is refreshed and the line marked "was N" — check and save again.
  - **View / print / PDF** (`/masters/stock-adjustment/:id`, `?print=1`, `?pdf=1`) — A4 document;
    posted adjustments can be **cancelled** (stock changes reversed). They are not edited.
  - Logic in `adjustment-store.ts` (unit tests in `adjustment-store.spec.ts`); PDF in
    `adjustment-pdf.ts` (reuses the purchase PDF building blocks).

## PDF download (purchase orders and entries)

*Download PDF* on the PO / entry view — or the download icon on a list row, which opens the view
with `?pdf=1` — saves `PO-2026-00001.pdf` / `PE-2026-00001.pdf`: the same A4 document as the
print, with real (selectable) text, the table heading repeated on every page, page numbers, and a
CANCELLED watermark on cancelled documents. Built in the browser with **pdfmake**
(`features/purchase/shared/purchase-pdf.ts` for the layouts, `shared/pdf/pdf-file.ts` for loading
it). pdfmake and its Roboto font (which has ₹) are loaded on the first download only, so the
app's start-up size is unchanged (`allowedCommonJsDependencies: ["pdfmake"]` in `angular.json`).
The shop logo is converted to PNG when it is WebP / SVG / GIF (pdfmake reads PNG and JPEG only).

## Reports (`/reports`, administrators only)

- **Sales Report** (`/reports/sales`) — opens on *this month* (1st → today). Quick periods: Today,
  Yesterday, This month, Last month, This FY (April–March); or type any From / To dates (at most
  366 days). Shows net sales, bills, average bill, quantity, discount and GST; the cash / UPI /
  card split (cash after change returned); and a sales / GST breakup. Only completed bills count.
- **Day-wise** lists the days that had sales with a total row; clicking a date opens **Bill-wise**
  for that day (paged bills of the period, with 80 mm reprint).
- **Export CSV** downloads the day-wise rows with every amount column (opens in Excel);
  **Print** prints the summary and day-wise table on A4 (`print-report` in `styles/_print.scss`).
- Customer-wise sales, purchase and stock reports are placeholders for later phases.
- Staff don't see Reports in the menu and are sent to their home page if they open the URL.

## Sign-in and roles

In `'api'` mode every page except `/login` requires a signed-in user (`core/auth`). The session is
an httpOnly cookie set by the backend; Angular sends the CSRF header automatically.

- **Home page by role** — `/` and sign-in go to `/dashboard` for administrators and `/billing`
  for staff (`homeUrlFor()` in `core/auth/auth.service.ts`). A `?returnUrl=` (internal paths
  only) wins over the home page.
- **Default login** — `npm run db:migrate` creates `admin` / `admin@123` when there are no users.
- **Temporary passwords** — the default admin, new accounts and admin resets must set their own
  password at `/account/password` before anything else works.
- **Users** (`/users`, administrators only) — add staff, change roles, activate/deactivate,
  reset passwords. Temporary passwords are shown once.
- An expired session sends the user back to `/login` (keeping the page) with a message.
- The backend needs migration `002_auth`: run `npm run db:migrate` in `Backend/`.

`'mock'` mode has no sign-in: a demo administrator is always signed in.

## UI conventions

- Small-screen first. Breakpoints: `sm 576`, `md 768`, `lg 992`, `xl 1200` (`src/styles/_mixins.scss`).
- Sidebar: off-canvas drawer below `lg`; collapsible icon rail on desktop (remembered).
- Tables become labelled cards below `md`; forms are single-column on phones and open as
  full-screen sheets.
- Product variants render as a grid-table from 1280 px and as cards below.
- List state (search, filters, sort, page) lives in the URL, so it survives
  "view details → back" and can be shared.
