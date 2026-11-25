/**
 * SQL for "items": the things that are sold, ordered and labelled — one row per product variant,
 * or one row per product that has no variants (the LEFT JOIN then yields a single row with NULL
 * variant columns). Shared by billing, purchase orders and the Items / Barcode screens so they
 * always agree on what an item is, its SKU, barcode and prices.
 */

/** The item's own barcode: the variant's, or the product's when it has no variants. */
export const ITEM_BARCODE = 'CASE WHEN v.id IS NULL THEN p.barcode ELSE v.barcode END';

export const ITEM_COLUMNS = `
  p.id AS "productId", v.id AS "variantId",
  p.name AS "productName", p.code AS "productCode", p.product_type AS "productType",
  COALESCE(b.name, '') AS "brandName",
  COALESCE(v.design_no, '') AS "designNo",
  COALESCE(s.name, '') AS "sizeName",
  COALESCE(co.name, '') AS "colorName",
  COALESCE(co.hex_code, '') AS "colorHex",
  COALESCE(v.sku, p.code) AS sku,
  ${ITEM_BARCODE} AS barcode,
  p.hsn_code AS "hsnCode", p.gst_rate AS "gstRate",
  COALESCE(v.mrp, p.mrp) AS mrp,
  COALESCE(v.selling_price, p.selling_price) AS "unitPrice",
  p.status,
  COALESCE(sl.quantity, 0) AS stock`;

/**
 * The item's quantity in hand (stock_levels, migration 008). Joins after `p` and `v`; every
 * query selecting ITEM_COLUMNS needs it (ITEM_FROM has it).
 */
export const STOCK_JOIN = `
  LEFT JOIN stock_levels sl
         ON sl.product_id = p.id AND stock_variant_key(sl.variant_id) = stock_variant_key(v.id)`;

/** Quantity in hand (0 when the item never moved). */
export const ITEM_STOCK = 'COALESCE(sl.quantity, 0)';

export const ITEM_FROM = `
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN product_variants v ON v.product_id = p.id
  LEFT JOIN sizes s ON s.id = v.size_id
  LEFT JOIN colors co ON co.id = v.color_id
  ${STOCK_JOIN}`;

/** Items of a product stay together, variants in the order staff entered them. */
export const ITEM_TIEBREAKER = 'p.id, v.position, v.created_at, v.id';
export const ITEM_ORDER = `ORDER BY lower(p.name), ${ITEM_TIEBREAKER}`;

/** The rate the shop buys at (variant override, else product). Only purchase screens ask for it. */
export const PURCHASE_PRICE_COLUMN = `COALESCE(v.purchase_price, p.purchase_price) AS "purchasePrice"`;

export const itemSelect = (extraColumns = '') =>
  `SELECT ${ITEM_COLUMNS}${extraColumns ? `, ${extraColumns}` : ''} ${ITEM_FROM}`;
