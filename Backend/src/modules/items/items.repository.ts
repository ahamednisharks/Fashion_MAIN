import { type Queryable, type TransactionClient, pool } from '../../config/database.js';
import { type Paged, offsetOf, toPaged } from '../../common/utils/pagination.js';
import { orderByClause } from '../../common/utils/sorting.js';
import { SqlParams, searchConditions, whereClause } from '../../common/utils/sql.js';
import {
  ITEM_BARCODE,
  ITEM_COLUMNS,
  ITEM_FROM,
  ITEM_STOCK,
  ITEM_TIEBREAKER,
  STOCK_JOIN,
} from './item-sql.js';
import type {
  BarcodeSettingsInput,
  CatalogItem,
  ItemCounts,
  ItemListQuery,
  LabelLayout,
} from './items.schema.js';

const LIST_COLUMNS = `${ITEM_COLUMNS},
  p.category_id AS "categoryId", c.name AS "categoryName"`;

const LIST_FROM = `${ITEM_FROM}
  JOIN categories c ON c.id = p.category_id`;

const SORTABLE: Readonly<Record<string, string>> = {
  name: 'lower(p.name)',
  sku: 'lower(COALESCE(v.sku, p.code))',
  // Items without a barcode sort last (NULLS LAST) whichever the direction.
  barcode: `NULLIF(${ITEM_BARCODE}, '')`,
  categoryName: 'lower(c.name)',
  brandName: 'lower(b.name)',
  mrp: 'COALESCE(v.mrp, p.mrp)',
  unitPrice: 'COALESCE(v.selling_price, p.selling_price)',
  stock: ITEM_STOCK,
  status: 'p.status',
};

/** barcode_settings row (id = 1, created by migration 005). */
export interface BarcodeSettingsRow {
  prefix: string;
  lastNumber: number;
  labelLayout: LabelLayout;
  showShopName: boolean;
  showProductName: boolean;
  showDetails: boolean;
  showMrp: boolean;
  showSellingPrice: boolean;
}

const SETTINGS_COLUMNS = `
  prefix, last_number AS "lastNumber", label_layout AS "labelLayout",
  show_shop_name AS "showShopName", show_product_name AS "showProductName",
  show_details AS "showDetails", show_mrp AS "showMrp",
  show_selling_price AS "showSellingPrice"`;

const DEFAULT_SETTINGS: BarcodeSettingsRow = {
  prefix: '200',
  lastNumber: 0,
  labelLayout: 'roll-50x25',
  showShopName: true,
  showProductName: true,
  showDetails: true,
  showMrp: true,
  showSellingPrice: false,
};

/** A barcode to write: on a variant (variantId) or on a product without variants. */
export interface BarcodeWrite {
  productId: string;
  variantId: string | null;
  barcode: string;
}

export class ItemsRepository {
  constructor(private readonly db: Queryable = pool) {}

  // ---- Items list ------------------------------------------------------------------------------

  async list(query: ItemListQuery): Promise<Paged<CatalogItem>> {
    const params = new SqlParams();
    const conditions = searchConditions(
      params,
      query.search,
      (p) =>
        `concat_ws(' ', p.name, p.code, p.barcode, b.name, c.name, v.sku, v.barcode, v.design_no,
                   s.name, co.name) ILIKE ${p}`,
    );
    if (query.status) conditions.push(`p.status = ${params.add(query.status)}`);
    if (query.categoryId) conditions.push(`p.category_id = ${params.add(query.categoryId)}`);
    if (query.brandId) conditions.push(`p.brand_id = ${params.add(query.brandId)}`);
    if (query.sizeId) conditions.push(`v.size_id = ${params.add(query.sizeId)}`);
    if (query.colorId) conditions.push(`v.color_id = ${params.add(query.colorId)}`);
    if (query.barcode === 'missing') conditions.push(`${ITEM_BARCODE} = ''`);
    if (query.barcode === 'assigned') conditions.push(`${ITEM_BARCODE} <> ''`);
    if (query.stock === 'in') conditions.push(`${ITEM_STOCK} > 0`);
    if (query.stock === 'out') conditions.push(`${ITEM_STOCK} <= 0`);
    if (query.stock === 'negative') conditions.push(`${ITEM_STOCK} < 0`);
    const where = whereClause(conditions);

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total ${LIST_FROM} ${where}`,
      params.values,
    );
    const order = orderByClause({
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      sortable: SORTABLE,
      defaultOrder: 'lower(p.name)',
      tiebreaker: ITEM_TIEBREAKER,
    });
    const limit = params.add(query.pageSize);
    const offset = params.add(offsetOf(query.page, query.pageSize));
    const rows = await this.db.query<CatalogItem>(
      `SELECT ${LIST_COLUMNS} ${LIST_FROM} ${where} ${order} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return toPaged(rows.rows, count.rows[0]?.total ?? 0, query.page, query.pageSize);
  }

  async counts(): Promise<ItemCounts> {
    const result = await this.db.query<ItemCounts>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE p.status = 'active')::int AS active,
              count(*) FILTER (WHERE p.status = 'active' AND ${ITEM_BARCODE} = '')::int
                AS "missingBarcode",
              count(*) FILTER (WHERE ${ITEM_STOCK} < 0)::int AS "belowZero"
         FROM products p
         LEFT JOIN product_variants v ON v.product_id = p.id
         ${STOCK_JOIN}`,
    );
    return result.rows[0] ?? { total: 0, active: 0, missingBarcode: 0, belowZero: 0 };
  }

  // ---- Barcodes --------------------------------------------------------------------------------

  /** Writes item barcodes (call under the catalogue-codes lock, after every check). */
  async writeBarcodes(tx: TransactionClient, writes: readonly BarcodeWrite[]): Promise<void> {
    const variants = writes.filter((write) => write.variantId !== null);
    const products = writes.filter((write) => write.variantId === null);
    if (variants.length) {
      await tx.query(
        `UPDATE product_variants v
            SET barcode = x.barcode
           FROM unnest($1::uuid[], $2::uuid[], $3::text[]) AS x(id, product_id, barcode)
          WHERE v.id = x.id AND v.product_id = x.product_id`,
        [
          variants.map((write) => write.variantId),
          variants.map((write) => write.productId),
          variants.map((write) => write.barcode),
        ],
      );
    }
    if (products.length) {
      await tx.query(
        `UPDATE products p
            SET barcode = x.barcode
           FROM unnest($1::uuid[], $2::text[]) AS x(id, barcode)
          WHERE p.id = x.id`,
        [products.map((write) => write.productId), products.map((write) => write.barcode)],
      );
    }
  }

  // ---- Settings --------------------------------------------------------------------------------

  async getSettings(db: Queryable = this.db): Promise<BarcodeSettingsRow> {
    const result = await db.query<BarcodeSettingsRow>(
      `SELECT ${SETTINGS_COLUMNS} FROM barcode_settings WHERE id = 1`,
    );
    return result.rows[0] ?? { ...DEFAULT_SETTINGS };
  }

  /** Locks the settings row so generated numbers are handed out one transaction at a time. */
  async lockSettings(tx: TransactionClient): Promise<BarcodeSettingsRow> {
    await tx.query('INSERT INTO barcode_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    const result = await tx.query<BarcodeSettingsRow>(
      `SELECT ${SETTINGS_COLUMNS} FROM barcode_settings WHERE id = 1 FOR UPDATE`,
    );
    return result.rows[0] ?? { ...DEFAULT_SETTINGS };
  }

  async setLastNumber(tx: TransactionClient, lastNumber: number): Promise<void> {
    await tx.query('UPDATE barcode_settings SET last_number = $1 WHERE id = 1', [lastNumber]);
  }

  async saveSettings(input: BarcodeSettingsInput): Promise<BarcodeSettingsRow> {
    const result = await this.db.query<BarcodeSettingsRow>(
      `INSERT INTO barcode_settings
         (id, prefix, label_layout, show_shop_name, show_product_name, show_details, show_mrp,
          show_selling_price)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
          SET prefix = EXCLUDED.prefix, label_layout = EXCLUDED.label_layout,
              show_shop_name = EXCLUDED.show_shop_name,
              show_product_name = EXCLUDED.show_product_name,
              show_details = EXCLUDED.show_details, show_mrp = EXCLUDED.show_mrp,
              show_selling_price = EXCLUDED.show_selling_price
       RETURNING ${SETTINGS_COLUMNS}`,
      [
        input.prefix,
        input.labelLayout,
        input.showShopName,
        input.showProductName,
        input.showDetails,
        input.showMrp,
        input.showSellingPrice,
      ],
    );
    return result.rows[0];
  }
}
