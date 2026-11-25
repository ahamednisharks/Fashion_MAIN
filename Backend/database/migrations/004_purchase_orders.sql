-- =============================================================================
-- 004 — Purchase orders (PO): what the shop orders from a supplier. A PO does not change
-- stock; Purchase Entry (a later migration) records the goods received against it.
--
--   * Rates are GST-exclusive (as suppliers quote them): GST is added on top of each line.
--   * PO numbers run without gaps per financial year (April–March), e.g. PO-2026-00001 for
--     April 2026 – March 2027. The counter row is locked by the saving transaction.
--   * POs are never deleted (cancel instead), so referenced masters can only be deactivated.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Number series for purchase documents ('PO' now, Purchase Entry later), one row per
-- series and financial year. financial_year is the year the April–March year starts in.
-- -----------------------------------------------------------------------------
CREATE TABLE document_counters (
  series         varchar(6)  NOT NULL CONSTRAINT document_counters_series_check CHECK (series ~ '^[A-Z]{2,6}$'),
  financial_year smallint    NOT NULL
                 CONSTRAINT document_counters_financial_year_check CHECK (financial_year BETWEEN 2000 AND 2999),
  last_number    integer     NOT NULL CONSTRAINT document_counters_last_number_check CHECK (last_number >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series, financial_year)
);
CREATE TRIGGER document_counters_set_updated_at BEFORE UPDATE ON document_counters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Purchase orders
-- -----------------------------------------------------------------------------
CREATE TABLE purchase_orders (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no               varchar(20)   NOT NULL,
  financial_year      smallint      NOT NULL,
  sequence_no         integer       NOT NULL CONSTRAINT purchase_orders_sequence_no_check CHECK (sequence_no > 0),
  po_date             date          NOT NULL,
  -- When the goods are expected (optional).
  expected_date       date
                      CONSTRAINT purchase_orders_expected_date_check CHECK (expected_date IS NULL OR expected_date >= po_date),
  supplier_id         uuid          NOT NULL
                      CONSTRAINT purchase_orders_supplier_id_fkey REFERENCES suppliers (id) ON DELETE RESTRICT,
  -- Supplier details as printed on the PO (refreshed whenever the PO is saved).
  supplier_name       varchar(100)  NOT NULL,
  supplier_mobile     varchar(10)   NOT NULL DEFAULT '',
  supplier_gst_number varchar(15)   NOT NULL DEFAULT '',
  supplier_address    varchar(400)  NOT NULL DEFAULT '',
  supplier_state      varchar(60)   NOT NULL DEFAULT '',
  -- 'intra' = CGST + SGST, 'inter' = IGST.
  supply_type         varchar(5)    NOT NULL
                      CONSTRAINT purchase_orders_supply_type_check CHECK (supply_type IN ('intra', 'inter')),
  notes               varchar(500)  NOT NULL DEFAULT '',
  item_count          integer       NOT NULL CONSTRAINT purchase_orders_item_count_check CHECK (item_count > 0),
  total_quantity      numeric(12,3) NOT NULL,
  gross_amount        numeric(12,2) NOT NULL,
  discount_total      numeric(12,2) NOT NULL,
  taxable_total       numeric(12,2) NOT NULL,
  cgst_total          numeric(12,2) NOT NULL,
  sgst_total          numeric(12,2) NOT NULL,
  igst_total          numeric(12,2) NOT NULL,
  round_off           numeric(6,2)  NOT NULL,
  grand_total         numeric(12,2) NOT NULL CONSTRAINT purchase_orders_grand_total_check CHECK (grand_total >= 0),
  -- open → (partial → received, set by Purchase Entry) or cancelled.
  status              varchar(10)   NOT NULL DEFAULT 'open'
                      CONSTRAINT purchase_orders_status_check CHECK (status IN ('open', 'partial', 'received', 'cancelled')),
  cancelled_at        timestamptz,
  created_by          uuid          NOT NULL
                      CONSTRAINT purchase_orders_created_by_fkey REFERENCES users (id) ON DELETE RESTRICT,
  created_by_name     varchar(100)  NOT NULL,
  updated_by_name     varchar(100)  NOT NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX purchase_orders_po_no_key ON purchase_orders (po_no);
CREATE UNIQUE INDEX purchase_orders_sequence_key ON purchase_orders (financial_year, sequence_no);
CREATE INDEX purchase_orders_po_date_idx ON purchase_orders (po_date, created_at);
CREATE INDEX purchase_orders_supplier_id_idx ON purchase_orders (supplier_id);
CREATE INDEX purchase_orders_status_idx ON purchase_orders (status);
CREATE INDEX purchase_orders_created_by_idx ON purchase_orders (created_by);
CREATE TRIGGER purchase_orders_set_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- PO lines. received_quantity is filled in by Purchase Entry.
-- -----------------------------------------------------------------------------
CREATE TABLE purchase_order_items (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id             uuid          NOT NULL
                    CONSTRAINT purchase_order_items_po_id_fkey REFERENCES purchase_orders (id) ON DELETE CASCADE,
  line_no           smallint      NOT NULL CONSTRAINT purchase_order_items_line_no_check CHECK (line_no > 0),
  product_id        uuid          NOT NULL
                    CONSTRAINT purchase_order_items_product_id_fkey REFERENCES products (id) ON DELETE RESTRICT,
  -- NULL for products without variants.
  variant_id        uuid
                    CONSTRAINT purchase_order_items_variant_id_fkey REFERENCES product_variants (id) ON DELETE RESTRICT,
  product_name      varchar(120)  NOT NULL,
  product_code      varchar(30)   NOT NULL,
  design_no         varchar(30)   NOT NULL DEFAULT '',
  size_name         varchar(20)   NOT NULL DEFAULT '',
  color_name        varchar(40)   NOT NULL DEFAULT '',
  sku               varchar(60)   NOT NULL,
  barcode           varchar(48)   NOT NULL DEFAULT '',
  hsn_code          varchar(8)    NOT NULL DEFAULT '',
  gst_rate          numeric(5,2)  NOT NULL,
  quantity          numeric(10,3) NOT NULL CONSTRAINT purchase_order_items_quantity_check CHECK (quantity > 0),
  -- GST-exclusive purchase rate per unit.
  rate              numeric(12,2) NOT NULL CONSTRAINT purchase_order_items_rate_check CHECK (rate >= 0),
  discount_percent  numeric(5,2)  NOT NULL DEFAULT 0
                    CONSTRAINT purchase_order_items_discount_percent_check CHECK (discount_percent BETWEEN 0 AND 100),
  gross_amount      numeric(12,2) NOT NULL,
  discount_amount   numeric(12,2) NOT NULL,
  taxable_value     numeric(12,2) NOT NULL,
  cgst_amount       numeric(12,2) NOT NULL,
  sgst_amount       numeric(12,2) NOT NULL,
  igst_amount       numeric(12,2) NOT NULL,
  line_total        numeric(12,2) NOT NULL,
  received_quantity numeric(10,3) NOT NULL DEFAULT 0
                    CONSTRAINT purchase_order_items_received_quantity_check CHECK (received_quantity >= 0)
);
CREATE UNIQUE INDEX purchase_order_items_line_key ON purchase_order_items (po_id, line_no);
CREATE INDEX purchase_order_items_product_id_idx ON purchase_order_items (product_id);
CREATE INDEX purchase_order_items_variant_id_idx ON purchase_order_items (variant_id);
