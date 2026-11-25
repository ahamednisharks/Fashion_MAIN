-- =============================================================================
-- 007 — Purchase entries (PE): goods received from a supplier, entered from the supplier's
-- invoice — against a purchase order or directly.
--
--   * Rates are GST-exclusive like purchase orders: GST is added on top of each line.
--   * PE numbers run without gaps per financial year (April–March) in document_counters,
--     series 'PE', e.g. PE-2026-00001.
--   * A PE may be linked to one PO of the same supplier. The PO's received quantities and
--     status (open / partial / received) are recomputed from its saved (not cancelled) entries,
--     matching PE lines to PO lines by item (a PO lists each item once).
--   * Stock levels come with the Inventory phase, which reads the quantities kept here.
--   * Entries are never deleted (cancel instead), so referenced masters can only be deactivated.
-- =============================================================================

CREATE TABLE purchase_entries (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  pe_no                 varchar(20)   NOT NULL,
  financial_year        smallint      NOT NULL,
  sequence_no           integer       NOT NULL CONSTRAINT purchase_entries_sequence_no_check CHECK (sequence_no > 0),
  -- The day the goods were received (the PE date; decides the number's financial year).
  entry_date            date          NOT NULL,
  supplier_id           uuid          NOT NULL
                        CONSTRAINT purchase_entries_supplier_id_fkey REFERENCES suppliers (id) ON DELETE RESTRICT,
  -- Supplier details as on the entry (refreshed whenever the entry is saved).
  supplier_name         varchar(100)  NOT NULL,
  supplier_mobile       varchar(10)   NOT NULL DEFAULT '',
  supplier_gst_number   varchar(15)   NOT NULL DEFAULT '',
  supplier_address      varchar(400)  NOT NULL DEFAULT '',
  supplier_state        varchar(60)   NOT NULL DEFAULT '',
  -- The supplier's own invoice (bill) the goods came with.
  supplier_invoice_no   varchar(30)   NOT NULL
                        CONSTRAINT purchase_entries_supplier_invoice_no_check CHECK (btrim(supplier_invoice_no) <> ''),
  supplier_invoice_date date          NOT NULL
                        CONSTRAINT purchase_entries_supplier_invoice_date_check CHECK (supplier_invoice_date <= entry_date),
  -- The purchase order received against (NULL = direct purchase).
  po_id                 uuid
                        CONSTRAINT purchase_entries_po_id_fkey REFERENCES purchase_orders (id) ON DELETE RESTRICT,
  -- 'intra' = CGST + SGST, 'inter' = IGST.
  supply_type           varchar(5)    NOT NULL
                        CONSTRAINT purchase_entries_supply_type_check CHECK (supply_type IN ('intra', 'inter')),
  notes                 varchar(500)  NOT NULL DEFAULT '',
  item_count            integer       NOT NULL CONSTRAINT purchase_entries_item_count_check CHECK (item_count > 0),
  total_quantity        numeric(12,3) NOT NULL,
  gross_amount          numeric(12,2) NOT NULL,
  discount_total        numeric(12,2) NOT NULL,
  taxable_total         numeric(12,2) NOT NULL,
  cgst_total            numeric(12,2) NOT NULL,
  sgst_total            numeric(12,2) NOT NULL,
  igst_total            numeric(12,2) NOT NULL,
  round_off             numeric(6,2)  NOT NULL,
  grand_total           numeric(12,2) NOT NULL CONSTRAINT purchase_entries_grand_total_check CHECK (grand_total >= 0),
  -- Total printed on the supplier's invoice, as typed (optional; shown against grand_total).
  bill_amount           numeric(12,2)
                        CONSTRAINT purchase_entries_bill_amount_check CHECK (bill_amount IS NULL OR bill_amount >= 0),
  status                varchar(10)   NOT NULL DEFAULT 'posted'
                        CONSTRAINT purchase_entries_status_check CHECK (status IN ('posted', 'cancelled')),
  cancelled_at          timestamptz,
  created_by            uuid          NOT NULL
                        CONSTRAINT purchase_entries_created_by_fkey REFERENCES users (id) ON DELETE RESTRICT,
  created_by_name       varchar(100)  NOT NULL,
  updated_by_name       varchar(100)  NOT NULL,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX purchase_entries_pe_no_key ON purchase_entries (pe_no);
CREATE UNIQUE INDEX purchase_entries_sequence_key ON purchase_entries (financial_year, sequence_no);
-- The same supplier invoice cannot be entered twice in a financial year (cancelled entries
-- do not count, so a cancelled entry can be entered again).
CREATE UNIQUE INDEX purchase_entries_supplier_invoice_key
  ON purchase_entries (supplier_id, financial_year, lower(supplier_invoice_no))
  WHERE status = 'posted';
CREATE INDEX purchase_entries_entry_date_idx ON purchase_entries (entry_date, created_at);
CREATE INDEX purchase_entries_supplier_id_idx ON purchase_entries (supplier_id);
CREATE INDEX purchase_entries_po_id_idx ON purchase_entries (po_id);
CREATE INDEX purchase_entries_status_idx ON purchase_entries (status);
CREATE INDEX purchase_entries_created_by_idx ON purchase_entries (created_by);
CREATE TRIGGER purchase_entries_set_updated_at BEFORE UPDATE ON purchase_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- PE lines. mrp / selling_price are the prices set for the item when the goods came in
-- (GST inclusive, like billing); rate is the GST-exclusive purchase rate.
-- -----------------------------------------------------------------------------
CREATE TABLE purchase_entry_items (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id         uuid          NOT NULL
                   CONSTRAINT purchase_entry_items_entry_id_fkey REFERENCES purchase_entries (id) ON DELETE CASCADE,
  line_no          smallint      NOT NULL CONSTRAINT purchase_entry_items_line_no_check CHECK (line_no > 0),
  product_id       uuid          NOT NULL
                   CONSTRAINT purchase_entry_items_product_id_fkey REFERENCES products (id) ON DELETE RESTRICT,
  -- NULL for products without variants.
  variant_id       uuid
                   CONSTRAINT purchase_entry_items_variant_id_fkey REFERENCES product_variants (id) ON DELETE RESTRICT,
  product_name     varchar(120)  NOT NULL,
  product_code     varchar(30)   NOT NULL,
  design_no        varchar(30)   NOT NULL DEFAULT '',
  size_name        varchar(20)   NOT NULL DEFAULT '',
  color_name       varchar(40)   NOT NULL DEFAULT '',
  sku              varchar(60)   NOT NULL,
  barcode          varchar(48)   NOT NULL DEFAULT '',
  hsn_code         varchar(8)    NOT NULL DEFAULT '',
  gst_rate         numeric(5,2)  NOT NULL,
  quantity         numeric(10,3) NOT NULL CONSTRAINT purchase_entry_items_quantity_check CHECK (quantity > 0),
  rate             numeric(12,2) NOT NULL CONSTRAINT purchase_entry_items_rate_check CHECK (rate >= 0),
  discount_percent numeric(5,2)  NOT NULL DEFAULT 0
                   CONSTRAINT purchase_entry_items_discount_percent_check CHECK (discount_percent BETWEEN 0 AND 100),
  gross_amount     numeric(12,2) NOT NULL,
  discount_amount  numeric(12,2) NOT NULL,
  taxable_value    numeric(12,2) NOT NULL,
  cgst_amount      numeric(12,2) NOT NULL,
  sgst_amount      numeric(12,2) NOT NULL,
  igst_amount      numeric(12,2) NOT NULL,
  line_total       numeric(12,2) NOT NULL,
  mrp              numeric(12,2) NOT NULL CONSTRAINT purchase_entry_items_mrp_check CHECK (mrp >= 0),
  selling_price    numeric(12,2) NOT NULL
                   CONSTRAINT purchase_entry_items_selling_price_check CHECK (selling_price >= 0 AND selling_price <= mrp)
);
CREATE UNIQUE INDEX purchase_entry_items_line_key ON purchase_entry_items (entry_id, line_no);
CREATE INDEX purchase_entry_items_product_id_idx ON purchase_entry_items (product_id);
CREATE INDEX purchase_entry_items_variant_id_idx ON purchase_entry_items (variant_id);
