-- =============================================================================
-- 003 — Billing: shop profile, sales invoices (bills), their lines and payments.
--
--   * Prices are GST-inclusive (like MRP): tax is worked backwards from the amount.
--   * Bills keep a snapshot of everything printed on them (seller, customer, item names,
--     prices, tax), so later master-data edits never change an old bill.
--   * Bill numbers run without gaps per financial year (April–March), e.g. INV/26-27/00001.
--     The counter row is locked by the saving transaction, so a failed save leaves no gap.
--   * Bills are never deleted (GST record keeping); referenced masters can only be deactivated.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shop profile (single row) — printed on bills.
-- -----------------------------------------------------------------------------
CREATE TABLE shop_settings (
  id          smallint      PRIMARY KEY DEFAULT 1 CONSTRAINT shop_settings_single_row CHECK (id = 1),
  shop_name   varchar(100)  NOT NULL DEFAULT '',
  phone       varchar(10)   NOT NULL DEFAULT ''
              CONSTRAINT shop_settings_phone_check CHECK (phone = '' OR phone ~ '^[6-9][0-9]{9}$'),
  email       varchar(100)  NOT NULL DEFAULT '',
  gst_number  varchar(15)   NOT NULL DEFAULT ''
              CONSTRAINT shop_settings_gst_number_check
              CHECK (gst_number = '' OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  address     varchar(250)  NOT NULL DEFAULT '',
  city        varchar(60)   NOT NULL DEFAULT '',
  state       varchar(60)   NOT NULL DEFAULT '',
  pincode     varchar(6)    NOT NULL DEFAULT ''
              CONSTRAINT shop_settings_pincode_check CHECK (pincode = '' OR pincode ~ '^[1-9][0-9]{5}$'),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
INSERT INTO shop_settings (id) VALUES (1);
CREATE TRIGGER shop_settings_set_updated_at BEFORE UPDATE ON shop_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Bill number counters, one row per financial year ('26-27' = Apr 2026 – Mar 2027).
-- -----------------------------------------------------------------------------
CREATE TABLE invoice_counters (
  financial_year varchar(5)  PRIMARY KEY
                 CONSTRAINT invoice_counters_financial_year_check CHECK (financial_year ~ '^[0-9]{2}-[0-9]{2}$'),
  last_number    integer     NOT NULL CONSTRAINT invoice_counters_last_number_check CHECK (last_number >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER invoice_counters_set_updated_at BEFORE UPDATE ON invoice_counters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Sales invoices (counter bills)
-- -----------------------------------------------------------------------------
CREATE TABLE sales_invoices (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no          varchar(16)   NOT NULL,
  financial_year      varchar(5)    NOT NULL,
  sequence_no         integer       NOT NULL CONSTRAINT sales_invoices_sequence_no_check CHECK (sequence_no > 0),
  -- Shop's local (IST) calendar date of the bill.
  invoice_date        date          NOT NULL,
  -- Seller details as printed (snapshot of shop_settings when the bill was saved).
  seller              jsonb         NOT NULL,
  -- NULL = walk-in customer. Name / mobile / GSTIN / state are snapshots.
  customer_id         uuid
                      CONSTRAINT sales_invoices_customer_id_fkey REFERENCES customers (id) ON DELETE RESTRICT,
  customer_name       varchar(100)  NOT NULL DEFAULT '',
  customer_mobile     varchar(10)   NOT NULL DEFAULT '',
  customer_gst_number varchar(15)   NOT NULL DEFAULT '',
  customer_state      varchar(60)   NOT NULL DEFAULT '',
  -- 'intra' = CGST + SGST, 'inter' = IGST.
  supply_type         varchar(5)    NOT NULL
                      CONSTRAINT sales_invoices_supply_type_check CHECK (supply_type IN ('intra', 'inter')),
  item_count          integer       NOT NULL CONSTRAINT sales_invoices_item_count_check CHECK (item_count > 0),
  total_quantity      numeric(12,3) NOT NULL,
  gross_amount        numeric(12,2) NOT NULL,
  discount_total      numeric(12,2) NOT NULL,
  taxable_total       numeric(12,2) NOT NULL,
  cgst_total          numeric(12,2) NOT NULL,
  sgst_total          numeric(12,2) NOT NULL,
  igst_total          numeric(12,2) NOT NULL,
  round_off           numeric(6,2)  NOT NULL,
  grand_total         numeric(12,2) NOT NULL CONSTRAINT sales_invoices_grand_total_check CHECK (grand_total >= 0),
  -- Sum of all payments (cash tendered may exceed the bill; the difference is returned as change).
  amount_received     numeric(12,2) NOT NULL,
  change_returned     numeric(12,2) NOT NULL CONSTRAINT sales_invoices_change_returned_check CHECK (change_returned >= 0),
  status              varchar(10)   NOT NULL DEFAULT 'completed'
                      CONSTRAINT sales_invoices_status_check CHECK (status IN ('completed', 'cancelled')),
  created_by          uuid          NOT NULL
                      CONSTRAINT sales_invoices_created_by_fkey REFERENCES users (id) ON DELETE RESTRICT,
  created_by_name     varchar(100)  NOT NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sales_invoices_invoice_no_key ON sales_invoices (invoice_no);
CREATE UNIQUE INDEX sales_invoices_sequence_key ON sales_invoices (financial_year, sequence_no);
CREATE INDEX sales_invoices_invoice_date_idx ON sales_invoices (invoice_date, created_at);
CREATE INDEX sales_invoices_customer_id_idx ON sales_invoices (customer_id);
CREATE INDEX sales_invoices_created_by_idx ON sales_invoices (created_by);
CREATE TRIGGER sales_invoices_set_updated_at BEFORE UPDATE ON sales_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Bill lines. product / variant keep the link for stock (Inventory phase); the other
-- columns are what was printed.
-- -----------------------------------------------------------------------------
CREATE TABLE sales_invoice_items (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid          NOT NULL
                   CONSTRAINT sales_invoice_items_invoice_id_fkey REFERENCES sales_invoices (id) ON DELETE CASCADE,
  line_no          smallint      NOT NULL CONSTRAINT sales_invoice_items_line_no_check CHECK (line_no > 0),
  product_id       uuid          NOT NULL
                   CONSTRAINT sales_invoice_items_product_id_fkey REFERENCES products (id) ON DELETE RESTRICT,
  -- NULL for products sold without variants.
  variant_id       uuid
                   CONSTRAINT sales_invoice_items_variant_id_fkey REFERENCES product_variants (id) ON DELETE RESTRICT,
  product_name     varchar(120)  NOT NULL,
  product_code     varchar(30)   NOT NULL,
  design_no        varchar(30)   NOT NULL DEFAULT '',
  size_name        varchar(20)   NOT NULL DEFAULT '',
  color_name       varchar(40)   NOT NULL DEFAULT '',
  sku              varchar(60)   NOT NULL,
  barcode          varchar(48)   NOT NULL DEFAULT '',
  hsn_code         varchar(8)    NOT NULL DEFAULT '',
  gst_rate         numeric(5,2)  NOT NULL,
  mrp              numeric(12,2) NOT NULL,
  unit_price       numeric(12,2) NOT NULL CONSTRAINT sales_invoice_items_unit_price_check CHECK (unit_price >= 0),
  quantity         numeric(10,3) NOT NULL CONSTRAINT sales_invoice_items_quantity_check CHECK (quantity > 0),
  discount_percent numeric(5,2)  NOT NULL DEFAULT 0
                   CONSTRAINT sales_invoice_items_discount_percent_check CHECK (discount_percent BETWEEN 0 AND 100),
  gross_amount     numeric(12,2) NOT NULL,
  discount_amount  numeric(12,2) NOT NULL,
  taxable_value    numeric(12,2) NOT NULL,
  cgst_amount      numeric(12,2) NOT NULL,
  sgst_amount      numeric(12,2) NOT NULL,
  igst_amount      numeric(12,2) NOT NULL,
  line_total       numeric(12,2) NOT NULL
);
CREATE UNIQUE INDEX sales_invoice_items_line_key ON sales_invoice_items (invoice_id, line_no);
CREATE INDEX sales_invoice_items_product_id_idx ON sales_invoice_items (product_id);
CREATE INDEX sales_invoice_items_variant_id_idx ON sales_invoice_items (variant_id);

-- -----------------------------------------------------------------------------
-- Payments received against a bill (split payments allowed).
-- -----------------------------------------------------------------------------
CREATE TABLE sales_invoice_payments (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid          NOT NULL
             CONSTRAINT sales_invoice_payments_invoice_id_fkey REFERENCES sales_invoices (id) ON DELETE CASCADE,
  mode       varchar(10)   NOT NULL
             CONSTRAINT sales_invoice_payments_mode_check CHECK (mode IN ('cash', 'upi', 'card')),
  amount     numeric(12,2) NOT NULL CONSTRAINT sales_invoice_payments_amount_check CHECK (amount > 0),
  -- UPI transaction id / card last digits (optional).
  reference  varchar(60)   NOT NULL DEFAULT '',
  position   smallint      NOT NULL DEFAULT 0
);
CREATE INDEX sales_invoice_payments_invoice_id_idx ON sales_invoice_payments (invoice_id, position);

-- -----------------------------------------------------------------------------
-- Fast exact lookups for barcode scanning (barcodes are matched case-insensitively).
-- -----------------------------------------------------------------------------
CREATE INDEX products_barcode_lower_idx ON products (lower(barcode)) WHERE barcode <> '';
CREATE INDEX product_variants_barcode_lower_idx ON product_variants (lower(barcode)) WHERE barcode <> '';
