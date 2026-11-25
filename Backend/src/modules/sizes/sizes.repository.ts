import { type Queryable, pool } from '../../config/database.js';
import { type MasterTable, MasterRepository } from '../../common/crud/master.repository.js';
import type { Size, SizeInput } from './sizes.schema.js';

/**
 * Natural size order: clothing XS → 6XL, then numeric sizes ascending, then custom sizes A–Z.
 * Shared with product variant queries so sizes appear in the same order everywhere.
 */
export function sizeOrderSql(alias: string): string {
  return `CASE ${alias}.size_type WHEN 'clothing' THEN 0 WHEN 'numeric' THEN 1 ELSE 2 END,
    CASE upper(replace(${alias}.name, ' ', ''))
      WHEN 'XXS' THEN 0 WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3 WHEN 'L' THEN 4
      WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6 WHEN '2XL' THEN 6 WHEN 'XXXL' THEN 7 WHEN '3XL' THEN 7
      WHEN '4XL' THEN 8 WHEN '5XL' THEN 9 WHEN '6XL' THEN 10 ELSE 99 END,
    CASE WHEN ${alias}.name ~ '^[0-9]+(\\.[0-9]+)?$' THEN ${alias}.name::numeric END NULLS LAST,
    lower(${alias}.name)`;
}

const TABLE: MasterTable = {
  table: 'sizes',
  alias: 's',
  columns: `s.id, s.name, s.size_type AS type, s.description, s.status,
            s.created_at AS "createdAt", s.updated_at AS "updatedAt"`,
  searchSql: (p) => `concat_ws(' ', s.name, s.size_type, s.description) ILIKE ${p}`,
  sortable: {
    name: 'lower(s.name)',
    type: 's.size_type',
    status: 's.status',
    createdAt: 's.created_at',
    updatedAt: 's.updated_at',
  },
  defaultOrder: sizeOrderSql('s'),
  filters: { type: 's.size_type' },
  uniqueFields: { name: 's.name' },
};

export class SizesRepository extends MasterRepository<Size, SizeInput> {
  constructor(db: Queryable = pool) {
    super(TABLE, db);
  }

  async create(input: SizeInput): Promise<Size> {
    const result = await this.db.query<Size>(
      `INSERT INTO sizes AS s (name, size_type, description, status)
       VALUES ($1, $2, $3, $4)
       RETURNING ${TABLE.columns}`,
      [input.name, input.type, input.description, input.status],
    );
    return result.rows[0];
  }

  async update(id: string, input: SizeInput): Promise<Size | null> {
    const result = await this.db.query<Size>(
      `UPDATE sizes AS s
          SET name = $1, size_type = $2, description = $3, status = $4
        WHERE s.id = $5
       RETURNING ${TABLE.columns}`,
      [input.name, input.type, input.description, input.status, id],
    );
    return result.rows[0] ?? null;
  }

  /** Number of products with at least one variant in this size. */
  async countProducts(sizeId: string): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      'SELECT count(DISTINCT product_id)::int AS count FROM product_variants WHERE size_id = $1',
      [sizeId],
    );
    return result.rows[0]?.count ?? 0;
  }
}
