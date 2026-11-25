-- =============================================================================
-- 009 — Stock adjustments (ADJ): changes to stock that no purchase entry or bill explains —
-- opening stock, a physical stock count, damaged / lost / found goods.
--
--   * Two ways to enter a line: 'count' — the quantity counted; the stock changes by
--     counted − in stock (worked out on the server when saved) — or 'change' — the quantity
--     to add (+) or take out (−).
--   * Each line keeps the stock before (system_quantity), the counted quantity (count mode)
--     and the change (quantity, signed; 0 = the count matched). Lines with a change become
--     stock movements (stock_movements, kind 'adjustment', source 'stock_adjustment').
--   * unit_cost is what one piece cost (GST exclusive), filled in from the item's purchase
--     price and editable; value = quantity × unit_cost (signed). Used for stock value later.
--   * Numbers run without gaps per financial year (April–March) in document_counters,
--     series 'ADJ', e.g. ADJ-2026-00001.
--   * Adjustments are not edited: a wrong one is cancelled (its stock change is reversed) and
--     entered again. They are never deleted.
-- =============================================================================

CREATE TABLE stock_adjustments (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  adj_no            varchar(20)   NOT NULL,
  financial_year    smallint      NOT NULL,
  sequence_no       integer       NOT NULL CONSTRAINT stock_adjustments_sequence_no_check CHECK (sequence_no > 0),
  -- The day of the count / damage / opening stock (decides the number's financial year).
  adjustment_date   date          NOT NULL,
  mode              varchar(6)    NOT NULL
                    CONSTRAINT stock_adjustments_mode_check CHECK (mode IN ('count', 'change')),
  reason            varchar(20)   NOT NULL
                    CONSTRAINT stock_adjustments_reason_check
                    CHECK (reason IN ('opening_stock', 'stock_count', 'damaged', 'lost', 'found', 'other')),
  notes             varchar(500)  NOT NULL DEFAULT '',
  item_count        integer       NOT NULL CONSTRAINT stock_adjustments_item_count_check CHECK (item_count > 0),
  -- Sum of the increases / of the decreases (both ≥ 0) and their value at unit cost.
  quantity_in       numeric(12,3) NOT NULL CONSTRAINT stock_adjustments_quantity_in_check CHECK (quantity_in >= 0),
  quantity_out      numeric(12,3) NOT NULL CONSTRAINT stock_adjustments_quantity_out_check CHECK (quantity_out >= 0),
  value_in          numeric(14,2) NOT NULL CONSTRAINT stock_adjustments_value_in_check CHECK (value_in >= 0),
  value_out         numeric(14,2) NOT NULL CONSTRAINT stock_adjustments_value_out_check CHECK (value_out >= 0),
  status            varchar(10)   NOT NULL DEFAULT 'posted'
                    CONSTRAINT stock_adjustments_status_check CHECK (status IN ('posted', 'cancelled')),
  cancelled_at      timestamptz,
  cancelled_by_name varchar(100),
  created_by        uuid          NOT NULL
                    CONSTRAINT stock_adjustments_created_by_fkey REFERENCES users (id) ON DELETE RESTRICT,
  created_by_name   varchar(100)  NOT NULL,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stock_adjustments_adj_no_key ON stock_adjustments (adj_no);
CREATE UNIQUE INDEX stock_adjustments_sequence_key ON stock_adjustments (financial_year, sequence_no);
CREATE INDEX stock_adjustments_date_idx ON stock_adjustments (adjustment_date, created_at);
CREATE INDEX stock_adjustments_status_idx ON stock_adjustments (status);
CREATE INDEX stock_adjustments_created_by_idx ON stock_adjustments (created_by);
CREATE TRIGGER stock_adjustments_set_updated_at BEFORE UPDATE ON stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Adjustment lines: a snapshot of the item, the stock before, the count and the change.
-- -----------------------------------------------------------------------------
CREATE TABLE stock_adjustment_items (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id    uuid          NOT NULL
                   CONSTRAINT stock_adjustment_items_adjustment_id_fkey REFERENCES stock_adjustments (id) ON DELETE CASCADE,
  line_no          smallint      NOT NULL CONSTRAINT stock_adjustment_items_line_no_check CHECK (line_no > 0),
  product_id       uuid          NOT NULL
                   CONSTRAINT stock_adjustment_items_product_id_fkey REFERENCES products (id) ON DELETE RESTRICT,
  -- NULL for products without variants.
  variant_id       uuid
                   CONSTRAINT stock_adjustment_items_variant_id_fkey REFERENCES product_variants (id) ON DELETE RESTRICT,
  product_name     varchar(120)  NOT NULL,
  product_code     varchar(30)   NOT NULL,
  design_no        varchar(30)   NOT NULL DEFAULT '',
  size_name        varchar(20)   NOT NULL DEFAULT '',
  color_name       varchar(40)   NOT NULL DEFAULT '',
  sku              varchar(60)   NOT NULL,
  barcode          varchar(48)   NOT NULL DEFAULT '',
  -- Quantity in hand when the adjustment was saved (may be below zero).
  system_quantity  numeric(12,3) NOT NULL,
  -- Count mode: the quantity counted. NULL in change mode.
  counted_quantity numeric(12,3)
                   CONSTRAINT stock_adjustment_items_counted_quantity_check
                   CHECK (counted_quantity IS NULL OR counted_quantity >= 0),
  -- The change to stock: + in, − out (0 = counted and matched).
  quantity         numeric(12,3) NOT NULL,
  unit_cost        numeric(12,2)
                   CONSTRAINT stock_adjustment_items_unit_cost_check CHECK (unit_cost IS NULL OR unit_cost >= 0),
  -- quantity × unit_cost, signed (0 when the cost is not known).
  value            numeric(14,2) NOT NULL DEFAULT 0,
  note             varchar(200)  NOT NULL DEFAULT '',
  CONSTRAINT stock_adjustment_items_count_check
    CHECK (counted_quantity IS NULL OR quantity = counted_quantity - system_quantity),
  CONSTRAINT stock_adjustment_items_change_check
    CHECK (counted_quantity IS NOT NULL OR quantity <> 0)
);
CREATE UNIQUE INDEX stock_adjustment_items_line_key ON stock_adjustment_items (adjustment_id, line_no);
CREATE INDEX stock_adjustment_items_product_id_idx ON stock_adjustment_items (product_id);
CREATE INDEX stock_adjustment_items_variant_id_idx ON stock_adjustment_items (variant_id);

-- -----------------------------------------------------------------------------
-- rebuild_stock() (migration 008) now recreates the movements of stock adjustments too, so
-- every movement can be rebuilt from its document.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rebuild_stock() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM stock_movements
   WHERE source_type IN ('purchase_entry', 'sales_invoice', 'stock_adjustment');

  INSERT INTO stock_movements
    (product_id, variant_id, movement_date, kind, quantity, source_type, source_id, source_no,
     source_line, unit_cost, created_at)
  SELECT i.product_id, i.variant_id, pe.entry_date, 'purchase', i.quantity, 'purchase_entry',
         pe.id, pe.pe_no, i.line_no, round(i.taxable_value / i.quantity, 2), pe.created_at
    FROM purchase_entry_items i
    JOIN purchase_entries pe ON pe.id = i.entry_id
   WHERE pe.status = 'posted';

  INSERT INTO stock_movements
    (product_id, variant_id, movement_date, kind, quantity, source_type, source_id, source_no,
     source_line, created_at)
  SELECT i.product_id, i.variant_id, s.invoice_date, 'sale', -i.quantity, 'sales_invoice',
         s.id, s.invoice_no, i.line_no, s.created_at
    FROM sales_invoice_items i
    JOIN sales_invoices s ON s.id = i.invoice_id
   WHERE s.status = 'completed';

  INSERT INTO stock_movements
    (product_id, variant_id, movement_date, kind, quantity, source_type, source_id, source_no,
     source_line, unit_cost, created_at)
  SELECT i.product_id, i.variant_id, a.adjustment_date, 'adjustment', i.quantity,
         'stock_adjustment', a.id, a.adj_no, i.line_no, i.unit_cost, a.created_at
    FROM stock_adjustment_items i
    JOIN stock_adjustments a ON a.id = i.adjustment_id
   WHERE a.status = 'posted' AND i.quantity <> 0;

  DELETE FROM stock_levels;
  INSERT INTO stock_levels (product_id, variant_id, quantity)
  SELECT product_id, variant_id, sum(quantity)
    FROM stock_movements
   GROUP BY product_id, variant_id;
END;
$$;
