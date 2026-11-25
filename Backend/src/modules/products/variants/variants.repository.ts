import { type Queryable, pool } from '../../../config/database.js';
import type { Variant, VariantInput } from '../products.schema.js';

const VARIANT_COLUMNS = `
  v.id, v.product_id AS "productId", v.design_no AS "designNo",
  v.size_id AS "sizeId", s.name AS "sizeName",
  v.color_id AS "colorId", co.name AS "colorName", co.hex_code AS "colorHex",
  v.sku, v.barcode, v.purchase_price AS "purchasePrice", v.selling_price AS "sellingPrice",
  v.mrp, v.position, v.created_at AS "createdAt", v.updated_at AS "updatedAt"`;

const VARIANT_FROM = `
  FROM product_variants v
  JOIN sizes s ON s.id = v.size_id
  JOIN colors co ON co.id = v.color_id`;

/** Variant fields written by insert / update (id and position are handled separately). */
type VariantValues = Pick<
  VariantInput,
  'designNo' | 'sizeId' | 'colorId' | 'sku' | 'barcode' | 'purchasePrice' | 'sellingPrice' | 'mrp'
>;

function variantValues(variant: VariantValues): unknown[] {
  return [
    variant.designNo,
    variant.sizeId,
    variant.colorId,
    variant.sku,
    variant.barcode,
    variant.purchasePrice,
    variant.sellingPrice,
    variant.mrp,
  ];
}

export class VariantsRepository {
  constructor(private readonly db: Queryable = pool) {}

  async findByProduct(productId: string, db: Queryable = this.db): Promise<Variant[]> {
    const result = await db.query<Variant>(
      `SELECT ${VARIANT_COLUMNS} ${VARIANT_FROM}
        WHERE v.product_id = $1
        ORDER BY v.position, v.created_at, v.id`,
      [productId],
    );
    return result.rows;
  }

  async findById(
    productId: string,
    variantId: string,
    db: Queryable = this.db,
  ): Promise<Variant | null> {
    const result = await db.query<Variant>(
      `SELECT ${VARIANT_COLUMNS} ${VARIANT_FROM} WHERE v.product_id = $1 AND v.id = $2`,
      [productId, variantId],
    );
    return result.rows[0] ?? null;
  }

  async insert(
    db: Queryable,
    productId: string,
    variant: VariantValues,
    position: number,
  ): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO product_variants
         (product_id, design_no, size_id, color_id, sku, barcode,
          purchase_price, selling_price, mrp, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [productId, ...variantValues(variant), position],
    );
    return result.rows[0].id;
  }

  async update(
    db: Queryable,
    variantId: string,
    variant: VariantValues,
    position?: number,
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE product_variants
          SET design_no = $1, size_id = $2, color_id = $3, sku = $4, barcode = $5,
              purchase_price = $6, selling_price = $7, mrp = $8,
              position = COALESCE($9, position)
        WHERE id = $10`,
      [...variantValues(variant), position ?? null, variantId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async delete(productId: string, variantId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM product_variants WHERE product_id = $1 AND id = $2',
      [productId, variantId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Removes the product's variants that are not in `keepIds`. */
  async deleteExcept(db: Queryable, productId: string, keepIds: readonly string[]): Promise<void> {
    await db.query(
      'DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))',
      [productId, keepIds],
    );
  }

  /**
   * Temporarily gives the product's variants unique placeholder SKUs / design numbers so a
   * save can swap values between variants without tripping unique indexes mid-transaction.
   */
  async parkUniqueKeys(db: Queryable, productId: string): Promise<void> {
    await db.query(
      `UPDATE product_variants
          SET sku = '~' || id::text, design_no = '~' || left(id::text, 29), barcode = ''
        WHERE product_id = $1`,
      [productId],
    );
  }

  async nextPosition(db: Queryable, productId: string): Promise<number> {
    const result = await db.query<{ next: number }>(
      'SELECT COALESCE(max(position) + 1, 0)::int AS next FROM product_variants WHERE product_id = $1',
      [productId],
    );
    return result.rows[0]?.next ?? 0;
  }
}
