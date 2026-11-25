import { type Queryable, pool } from '../../config/database.js';
import { type MasterTable, MasterRepository } from '../../common/crud/master.repository.js';
import type { Brand, BrandInput } from './brands.schema.js';

const TABLE: MasterTable = {
  table: 'brands',
  alias: 'b',
  columns: `b.id, b.name, b.description, b.status,
            b.created_at AS "createdAt", b.updated_at AS "updatedAt"`,
  searchSql: (p) => `concat_ws(' ', b.name, b.description) ILIKE ${p}`,
  sortable: {
    name: 'lower(b.name)',
    status: 'b.status',
    createdAt: 'b.created_at',
    updatedAt: 'b.updated_at',
  },
  defaultOrder: 'lower(b.name)',
  uniqueFields: { name: 'b.name' },
};

export class BrandsRepository extends MasterRepository<Brand, BrandInput> {
  constructor(db: Queryable = pool) {
    super(TABLE, db);
  }

  async create(input: BrandInput): Promise<Brand> {
    const result = await this.db.query<Brand>(
      `INSERT INTO brands AS b (name, description, status)
       VALUES ($1, $2, $3)
       RETURNING ${TABLE.columns}`,
      [input.name, input.description, input.status],
    );
    return result.rows[0];
  }

  async update(id: string, input: BrandInput): Promise<Brand | null> {
    const result = await this.db.query<Brand>(
      `UPDATE brands AS b
          SET name = $1, description = $2, status = $3
        WHERE b.id = $4
       RETURNING ${TABLE.columns}`,
      [input.name, input.description, input.status, id],
    );
    return result.rows[0] ?? null;
  }

  async countProducts(brandId: string): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM products WHERE brand_id = $1',
      [brandId],
    );
    return result.rows[0]?.count ?? 0;
  }
}
