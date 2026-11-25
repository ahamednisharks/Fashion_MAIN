import { type Queryable, pool } from '../../config/database.js';
import { type MasterTable, MasterRepository } from '../../common/crud/master.repository.js';
import type { Category, CategoryInput } from './categories.schema.js';

const TABLE: MasterTable = {
  table: 'categories',
  alias: 'c',
  columns: `c.id, c.name, c.description, c.status,
            c.created_at AS "createdAt", c.updated_at AS "updatedAt"`,
  searchSql: (p) => `concat_ws(' ', c.name, c.description) ILIKE ${p}`,
  sortable: {
    name: 'lower(c.name)',
    status: 'c.status',
    createdAt: 'c.created_at',
    updatedAt: 'c.updated_at',
  },
  defaultOrder: 'lower(c.name)',
  uniqueFields: { name: 'c.name' },
};

export class CategoriesRepository extends MasterRepository<Category, CategoryInput> {
  constructor(db: Queryable = pool) {
    super(TABLE, db);
  }

  async create(input: CategoryInput): Promise<Category> {
    const result = await this.db.query<Category>(
      `INSERT INTO categories AS c (name, description, status)
       VALUES ($1, $2, $3)
       RETURNING ${TABLE.columns}`,
      [input.name, input.description, input.status],
    );
    return result.rows[0];
  }

  async update(id: string, input: CategoryInput): Promise<Category | null> {
    const result = await this.db.query<Category>(
      `UPDATE categories AS c
          SET name = $1, description = $2, status = $3
        WHERE c.id = $4
       RETURNING ${TABLE.columns}`,
      [input.name, input.description, input.status, id],
    );
    return result.rows[0] ?? null;
  }

  async countProducts(categoryId: string): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM products WHERE category_id = $1',
      [categoryId],
    );
    return result.rows[0]?.count ?? 0;
  }
}
