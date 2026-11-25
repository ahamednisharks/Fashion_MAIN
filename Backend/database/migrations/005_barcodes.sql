-- =============================================================================
-- 005 — Barcodes & price labels: the shop's own barcode numbering and label settings.
--
--   * Shop barcodes are EAN-13 numbers in the GS1 "in-store" range (prefix 200–299), so
--     they can never clash with a manufacturer's barcode: prefix (3) + running number (9)
--     + check digit (1), e.g. 2000000000015. The counter row is locked by the saving
--     transaction; numbers already used by another item are skipped.
--   * Item barcodes themselves stay on products / product_variants (one namespace shared
--     by both tables, enforced by the API under the catalogue-codes advisory lock).
-- =============================================================================

CREATE TABLE barcode_settings (
  id                 smallint    PRIMARY KEY DEFAULT 1
                     CONSTRAINT barcode_settings_single_row CHECK (id = 1),
  prefix             char(3)     NOT NULL DEFAULT '200'
                     CONSTRAINT barcode_settings_prefix_check CHECK (prefix ~ '^2[0-9]{2}$'),
  -- Running number of the last generated barcode (0 = none yet).
  last_number        bigint      NOT NULL DEFAULT 0
                     CONSTRAINT barcode_settings_last_number_check CHECK (last_number BETWEEN 0 AND 999999999),
  -- Label stock: 50x25 mm roll, 38x25 mm roll two across, or A4 sheet of 65 (38.1 x 21.2 mm).
  label_layout       varchar(20) NOT NULL DEFAULT 'roll-50x25'
                     CONSTRAINT barcode_settings_label_layout_check
                     CHECK (label_layout IN ('roll-50x25', 'roll-38x25-2', 'a4-65')),
  -- What is printed on each label (the barcode itself is always printed).
  show_shop_name     boolean     NOT NULL DEFAULT true,
  show_product_name  boolean     NOT NULL DEFAULT true,
  show_details       boolean     NOT NULL DEFAULT true,
  show_mrp           boolean     NOT NULL DEFAULT true,
  show_selling_price boolean     NOT NULL DEFAULT false,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO barcode_settings (id) VALUES (1);
CREATE TRIGGER barcode_settings_set_updated_at BEFORE UPDATE ON barcode_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The Items screen filters on "no barcode yet"; these keep that and the barcode search quick.
CREATE INDEX product_variants_barcode_empty_idx ON product_variants (product_id) WHERE barcode = '';
CREATE INDEX products_barcode_empty_idx ON products (id) WHERE barcode = '';
