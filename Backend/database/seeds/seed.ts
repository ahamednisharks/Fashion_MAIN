import { logger } from '../../src/common/utils/logger.js';
import {
  type TransactionClient,
  closeDatabase,
  withTransaction,
} from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { ensureInitialAdmin, initialAdminMessage } from '../initial-admin.js';
import { isMainModule } from '../paths.js';
import * as data from './seed-data.js';

// The default admin login lives in ../initial-admin.ts (also created by `npm run db:migrate`).
export { DEFAULT_ADMIN_PASSWORD, INITIAL_ADMIN, initialAdminPassword } from '../initial-admin.js';

export interface SeedResult {
  readonly [table: string]: number;
}

async function insertCount(tx: TransactionClient, sql: string, values: unknown[]): Promise<number> {
  const result = await tx.query(sql, values);
  return result.rowCount ?? 0;
}

/**
 * Loads demo master data. Idempotent: rows are matched by natural key (name, mobile, product
 * code) and existing rows are left untouched, so it is safe to run repeatedly.
 */
export async function runSeeds(): Promise<SeedResult> {
  return withTransaction(async (tx) => {
    const counts: Record<string, number> = {
      categories: 0,
      brands: 0,
      sizes: 0,
      colors: 0,
      suppliers: 0,
      customers: 0,
      products: 0,
      variants: 0,
      users: 0,
    };

    // Normally created by db:migrate already; needed when the users table was emptied (tests).
    counts['users'] += (await ensureInitialAdmin(tx)) ? 1 : 0;

    for (const row of data.categories) {
      counts['categories'] += await insertCount(
        tx,
        `INSERT INTO categories (name, description, status) VALUES ($1, $2, $3)
         ON CONFLICT ((lower(name))) DO NOTHING`,
        [row.name, row.description, row.status ?? 'active'],
      );
    }
    for (const row of data.brands) {
      counts['brands'] += await insertCount(
        tx,
        `INSERT INTO brands (name, description, status) VALUES ($1, $2, $3)
         ON CONFLICT ((lower(name))) DO NOTHING`,
        [row.name, row.description, row.status ?? 'active'],
      );
    }
    for (const row of data.sizes) {
      counts['sizes'] += await insertCount(
        tx,
        `INSERT INTO sizes (name, size_type, description) VALUES ($1, $2, $3)
         ON CONFLICT ((lower(name))) DO NOTHING`,
        [row.name, row.type, row.description],
      );
    }
    for (const row of data.colors) {
      counts['colors'] += await insertCount(
        tx,
        `INSERT INTO colors (name, hex_code, description, status) VALUES ($1, $2, $3, $4)
         ON CONFLICT ((lower(name))) DO NOTHING`,
        [row.name, row.hexCode, row.description ?? '', row.status ?? 'active'],
      );
    }
    for (const row of data.suppliers) {
      counts['suppliers'] += await insertCount(
        tx,
        `INSERT INTO suppliers (name, contact_person, mobile, email, address, city, state, pincode,
                                gst_number, opening_balance, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT ((lower(name))) DO NOTHING`,
        [
          row.name,
          row.contactPerson ?? '',
          row.mobile,
          row.email,
          row.address,
          row.city,
          row.state,
          row.pincode,
          row.gstNumber,
          row.openingBalance,
          row.status ?? 'active',
        ],
      );
    }
    for (const row of data.customers) {
      counts['customers'] += await insertCount(
        tx,
        `INSERT INTO customers (name, mobile, email, address, city, state, pincode, gst_number,
                                opening_balance, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (mobile) DO NOTHING`,
        [
          row.name,
          row.mobile,
          row.email,
          row.address,
          row.city,
          row.state,
          row.pincode,
          row.gstNumber,
          row.openingBalance,
          row.status ?? 'active',
        ],
      );
    }

    for (const product of data.products) {
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO products (name, code, category_id, brand_id, description, product_type, hsn_code,
                               gst_rate, mrp, purchase_price, selling_price, barcode, status)
         VALUES ($1, $2,
                 (SELECT id FROM categories WHERE lower(name) = lower($3)),
                 (SELECT id FROM brands WHERE lower(name) = lower($4)),
                 $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT ((lower(code))) DO NOTHING
         RETURNING id`,
        [
          product.name,
          product.code,
          product.category,
          product.brand,
          product.description,
          product.productType,
          product.hsnCode,
          product.gstRate,
          product.mrp,
          product.purchasePrice,
          product.sellingPrice,
          product.barcode,
          product.status ?? 'active',
        ],
      );
      const productId = inserted.rows[0]?.id;
      if (!productId) {
        continue; // already seeded
      }
      counts['products'] += 1;

      for (const [position, [designNo, color, size, overrides]] of product.variants.entries()) {
        counts['variants'] += await insertCount(
          tx,
          `INSERT INTO product_variants (product_id, design_no, size_id, color_id, sku, barcode,
                                         purchase_price, selling_price, mrp, position)
           VALUES ($1, $2,
                   (SELECT id FROM sizes WHERE lower(name) = lower($3)),
                   (SELECT id FROM colors WHERE lower(name) = lower($4)),
                   $5, $6, $7, $8, $9, $10)`,
          [
            productId,
            designNo,
            size,
            color,
            data.buildSku(product.code, designNo, color, size),
            overrides?.barcode ?? '',
            overrides?.purchasePrice ?? null,
            overrides?.sellingPrice ?? null,
            overrides?.mrp ?? null,
            position,
          ],
        );
      }
    }
    return counts;
  });
}

if (isMainModule(import.meta.url)) {
  runSeeds()
    .then((counts) => {
      const summary = Object.entries(counts)
        .map(([table, count]) => `${table}: ${count}`)
        .join(', ');
      logger.info(`Seeded database "${env.db.database}" (new rows — ${summary}).`);
      if (counts['users']) {
        logger.info(initialAdminMessage());
      }
    })
    .catch((error: unknown) => {
      logger.error(
        'Seeding failed — no changes were made.',
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    })
    .finally(() => closeDatabase());
}
