import { type Queryable, pool } from '../../config/database.js';
import type { EntityStatus } from '../../common/validators/fields.js';
import { type Paged, offsetOf, toPaged } from '../../common/utils/pagination.js';
import { orderByClause } from '../../common/utils/sorting.js';
import { SqlParams, searchConditions, whereClause } from '../../common/utils/sql.js';
import type { Product, ProductInput, ProductListQuery, ProductSummary } from './products.schema.js';
import { VariantsRepository } from './variants/variants.repository.js';

const SUMMARY_COLUMNS = `
  p.id, p.name, p.code,
  p.category_id AS "categoryId", c.name AS "categoryName",
  p.brand_id AS "brandId", b.name AS "brandName",
  p.description, p.product_type AS "productType", p.hsn_code AS "hsnCode",
  p.gst_rate AS "gstRate", p.mrp, p.purchase_price AS "purchasePrice",
  p.selling_price AS "sellingPrice", p.barcode, p.status,
  (SELECT count(*) FROM product_variants pv WHERE pv.product_id = p.id)::int AS "variantCount",
  p.created_at AS "createdAt", p.updated_at AS "updatedAt"`;

const SUMMARY_FROM = `
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id`;

const SORTABLE: Readonly<Record<string, string>> = {
  name: 'lower(p.name)',
  code: 'lower(p.code)',
  categoryName: 'lower(c.name)',
  brandName: 'lower(b.name)',
  variantCount: '"variantCount"',
  sellingPrice: 'p.selling_price',
  mrp: 'p.mrp',
  status: 'p.status',
  createdAt: 'p.created_at',
  updatedAt: 'p.updated_at',
};

/** Tables a product may reference (fixed identifiers — safe in SQL text). */
export type ReferenceTable = 'categories' | 'brands' | 'sizes' | 'colors';

/** Excludes the record being saved from uniqueness checks. */
export interface CodeCheckScope {
  /** Ignore this product's own barcode and all of its variants (product save). */
  readonly excludeProductId?: string | null;
  /** Ignore only this variant (variant save). */
  readonly excludeVariantId?: string | null;
}

export interface CodeOwner {
  /** Lower-cased code that matched. */
  readonly code: string;
  readonly productName: string;
}

/** Arbitrary advisory-lock key serialising product code / SKU / barcode writes. */
const CATALOG_CODES_LOCK = 7_270_100;

export class ProductsRepository {
  readonly variants: VariantsRepository;

  constructor(private readonly db: Queryable = pool) {
    this.variants = new VariantsRepository(db);
  }

  async list(query: ProductListQuery): Promise<Paged<ProductSummary>> {
    const params = new SqlParams();
    const conditions = searchConditions(
      params,
      query.search,
      (p) =>
        `concat_ws(' ', p.name, p.code, p.barcode, p.hsn_code, c.name, b.name) ILIKE ${p}
         OR EXISTS (SELECT 1 FROM product_variants sv
                     WHERE sv.product_id = p.id
                       AND concat_ws(' ', sv.sku, sv.barcode, sv.design_no) ILIKE ${p})`,
    );
    if (query.status) conditions.push(`p.status = ${params.add(query.status)}`);
    if (query.categoryId) conditions.push(`p.category_id = ${params.add(query.categoryId)}`);
    if (query.brandId) conditions.push(`p.brand_id = ${params.add(query.brandId)}`);
    if (query.productType) conditions.push(`p.product_type = ${params.add(query.productType)}`);
    const where = whereClause(conditions);

    const count = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total ${SUMMARY_FROM} ${where}`,
      params.values,
    );
    const order = orderByClause({
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      sortable: SORTABLE,
      defaultOrder: 'lower(p.name)',
      tiebreaker: 'p.id',
    });
    const limit = params.add(query.pageSize);
    const offset = params.add(offsetOf(query.page, query.pageSize));
    const rows = await this.db.query<ProductSummary>(
      `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} ${where} ${order} LIMIT ${limit} OFFSET ${offset}`,
      params.values,
    );
    return toPaged(rows.rows, count.rows[0]?.total ?? 0, query.page, query.pageSize);
  }

  async findAll(status?: EntityStatus): Promise<ProductSummary[]> {
    const result = await this.db.query<ProductSummary>(
      `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM}
        WHERE ($1::text IS NULL OR p.status = $1)
        ORDER BY lower(p.name), p.id`,
      [status ?? null],
    );
    return result.rows;
  }

  /** Product with its variants (in display order). */
  async findById(id: string, db: Queryable = this.db): Promise<Product | null> {
    const result = await db.query<ProductSummary>(
      `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} WHERE p.id = $1`,
      [id],
    );
    const summary = result.rows[0];
    if (!summary) {
      return null;
    }
    return { ...summary, variants: await this.variants.findByProduct(id, db) };
  }

  async insert(db: Queryable, input: ProductInput): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO products
         (name, code, category_id, brand_id, description, product_type, hsn_code, gst_rate,
          mrp, purchase_price, selling_price, barcode, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      productValues(input),
    );
    return result.rows[0].id;
  }

  async update(db: Queryable, id: string, input: ProductInput): Promise<boolean> {
    const result = await db.query(
      `UPDATE products
          SET name = $1, code = $2, category_id = $3, brand_id = $4, description = $5,
              product_type = $6, hsn_code = $7, gst_rate = $8, mrp = $9, purchase_price = $10,
              selling_price = $11, barcode = $12, status = $13
        WHERE id = $14`,
      [...productValues(input), id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setStatus(id: string, status: EntityStatus): Promise<boolean> {
    const result = await this.db.query('UPDATE products SET status = $1 WHERE id = $2', [
      status,
      id,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  /** Deletes the product and (via ON DELETE CASCADE) its variants. */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM products WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Integrity helpers (call inside a transaction) ------------------------------------------

  /** Serialises catalog-code writes so cross-table barcode checks are race-free. */
  async lockCatalogCodes(db: Queryable): Promise<void> {
    await db.query('SELECT pg_advisory_xact_lock($1)', [CATALOG_CODES_LOCK]);
  }

  /** Status of each referenced row that exists (missing ids are absent from the map). */
  async findStatuses(
    db: Queryable,
    table: ReferenceTable,
    ids: readonly string[],
  ): Promise<Map<string, EntityStatus>> {
    if (!ids.length) {
      return new Map();
    }
    const result = await db.query<{ id: string; status: EntityStatus }>(
      `SELECT id, status FROM ${table} WHERE id = ANY($1::uuid[])`,
      [[...new Set(ids)]],
    );
    return new Map(result.rows.map((row) => [row.id, row.status]));
  }

  /** True when another product already uses this product code (case-insensitive). */
  async isCodeTaken(
    code: string,
    excludeProductId: string | null,
    db: Queryable = this.db,
  ): Promise<boolean> {
    const result = await db.query(
      `SELECT 1 FROM products WHERE lower(code) = lower($1) AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
      [code, excludeProductId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Products / variants already using any of these barcodes (product and variant barcodes share one namespace). */
  async findBarcodeOwners(
    db: Queryable,
    barcodes: readonly string[],
    scope: CodeCheckScope,
  ): Promise<CodeOwner[]> {
    if (!barcodes.length) {
      return [];
    }
    const result = await db.query<CodeOwner>(
      `SELECT lower(p.barcode) AS code, p.name AS "productName"
         FROM products p
        WHERE p.barcode <> '' AND lower(p.barcode) = ANY($1::text[])
          AND ($2::uuid IS NULL OR p.id <> $2::uuid)
       UNION ALL
       SELECT lower(v.barcode) AS code, p.name AS "productName"
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.barcode <> '' AND lower(v.barcode) = ANY($1::text[])
          AND ($2::uuid IS NULL OR v.product_id <> $2::uuid)
          AND ($3::uuid IS NULL OR v.id <> $3::uuid)`,
      [
        barcodes.map((code) => code.toLowerCase()),
        scope.excludeProductId ?? null,
        scope.excludeVariantId ?? null,
      ],
    );
    return result.rows;
  }

  /** Variants (of other products / other variants) already using any of these SKUs. */
  async findSkuOwners(
    db: Queryable,
    skus: readonly string[],
    scope: CodeCheckScope,
  ): Promise<CodeOwner[]> {
    if (!skus.length) {
      return [];
    }
    const result = await db.query<CodeOwner>(
      `SELECT lower(v.sku) AS code, p.name AS "productName"
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE lower(v.sku) = ANY($1::text[])
          AND ($2::uuid IS NULL OR v.product_id <> $2::uuid)
          AND ($3::uuid IS NULL OR v.id <> $3::uuid)`,
      [
        skus.map((sku) => sku.toLowerCase()),
        scope.excludeProductId ?? null,
        scope.excludeVariantId ?? null,
      ],
    );
    return result.rows;
  }

  /** For GET /products/exists. */
  async isTaken(
    field: 'code' | 'barcode' | 'sku',
    value: string,
    excludeId?: string,
  ): Promise<boolean> {
    if (field === 'code') {
      return this.isCodeTaken(value, excludeId ?? null);
    }
    const scope = { excludeProductId: excludeId ?? null };
    const owners =
      field === 'barcode'
        ? await this.findBarcodeOwners(this.db, [value], scope)
        : await this.findSkuOwners(this.db, [value], scope);
    return owners.length > 0;
  }
}

function productValues(input: ProductInput): unknown[] {
  return [
    input.name,
    input.code,
    input.categoryId,
    input.brandId,
    input.description,
    input.productType,
    input.hsnCode,
    input.gstRate,
    input.mrp,
    input.purchasePrice,
    input.sellingPrice,
    input.barcode,
    input.status,
  ];
}
