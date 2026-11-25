-- =============================================================================
-- 008 — Stock: a ledger of every stock change and the quantity in hand of every item.
--
--   * stock_movements — one row per item per document line: + for goods received (purchase
--     entries), − for goods sold (bills), ± for stock adjustments (upcoming screen). Saving,
--     editing or cancelling a document replaces its rows (src/modules/stock).
--   * stock_levels — the quantity in hand per item = the sum of its movements, updated in the
--     same transaction. It may go below zero (selling goods that were never entered).
--   * An item is a product variant, or a product without variants (variant_id NULL).
--   * rebuild_stock() recreates both from the documents; it fills them for existing data now.
-- =============================================================================

-- Stands in for "no variant" in unique keys (variant_id is NULL for products without variants).
CREATE FUNCTION stock_variant_key(variant uuid) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(variant, '00000000-0000-0000-0000-000000000000'::uuid)
$$;

CREATE TABLE stock_movements (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid          NOT NULL
                CONSTRAINT stock_movements_product_id_fkey REFERENCES products (id) ON DELETE RESTRICT,
  -- NULL for products without variants.
  variant_id    uuid
                CONSTRAINT stock_movements_variant_id_fkey REFERENCES product_variants (id) ON DELETE RESTRICT,
  -- The document's date (received on / bill date).
  movement_date date          NOT NULL,
  kind          varchar(12)   NOT NULL
                CONSTRAINT stock_movements_kind_check CHECK (kind IN ('purchase', 'sale', 'adjustment')),
  -- + in, − out (fabric in metres, so decimals).
  quantity      numeric(12,3) NOT NULL CONSTRAINT stock_movements_quantity_check CHECK (quantity <> 0),
  -- The document that moved the stock.
  source_type   varchar(20)   NOT NULL
                CONSTRAINT stock_movements_source_type_check
                CHECK (source_type IN ('purchase_entry', 'sales_invoice', 'stock_adjustment')),
  source_id     uuid          NOT NULL,
  source_no     varchar(20)   NOT NULL,
  source_line   smallint      NOT NULL,
  -- Purchases: GST-exclusive cost per unit after the line discount (for stock value later).
  unit_cost     numeric(12,2),
  created_at    timestamptz   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stock_movements_source_line_key
  ON stock_movements (source_type, source_id, source_line);
CREATE INDEX stock_movements_item_idx
  ON stock_movements (product_id, stock_variant_key(variant_id), movement_date, created_at);
CREATE INDEX stock_movements_variant_id_idx ON stock_movements (variant_id);

CREATE TABLE stock_levels (
  product_id uuid          NOT NULL
             CONSTRAINT stock_levels_product_id_fkey REFERENCES products (id) ON DELETE CASCADE,
  variant_id uuid
             CONSTRAINT stock_levels_variant_id_fkey REFERENCES product_variants (id) ON DELETE CASCADE,
  quantity   numeric(12,3) NOT NULL DEFAULT 0,
  updated_at timestamptz   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stock_levels_item_key ON stock_levels (product_id, stock_variant_key(variant_id));
CREATE INDEX stock_levels_variant_id_idx ON stock_levels (variant_id);

-- -----------------------------------------------------------------------------
-- Recreates the movements of purchase entries and bills from the documents (adjustment
-- movements are kept), then every stock level. Run once below for existing data; safe to run
-- again (SELECT rebuild_stock();) if the ledger is ever in doubt.
-- -----------------------------------------------------------------------------
CREATE FUNCTION rebuild_stock() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM stock_movements WHERE source_type IN ('purchase_entry', 'sales_invoice');

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

  DELETE FROM stock_levels;
  INSERT INTO stock_levels (product_id, variant_id, quantity)
  SELECT product_id, variant_id, sum(quantity)
    FROM stock_movements
   GROUP BY product_id, variant_id;
END;
$$;

SELECT rebuild_stock();
