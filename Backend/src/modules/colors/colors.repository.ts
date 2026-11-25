import { type Queryable, pool } from '../../config/database.js';
import { type MasterTable, MasterRepository } from '../../common/crud/master.repository.js';
import type { Color, ColorInput } from './colors.schema.js';

const TABLE: MasterTable = {
  table: 'colors',
  alias: 'co',
  columns: `co.id, co.name, co.hex_code AS "hexCode", co.description, co.status,
            co.created_at AS "createdAt", co.updated_at AS "updatedAt"`,
  searchSql: (p) => `concat_ws(' ', co.name, co.hex_code, co.description) ILIKE ${p}`,
  sortable: {
    name: 'lower(co.name)',
    hexCode: 'co.hex_code',
    status: 'co.status',
    createdAt: 'co.created_at',
    updatedAt: 'co.updated_at',
  },
  defaultOrder: 'lower(co.name)',
  uniqueFields: { name: 'co.name' },
};

export class ColorsRepository extends MasterRepository<Color, ColorInput> {
  constructor(db: Queryable = pool) {
    super(TABLE, db);
  }

  async create(input: ColorInput): Promise<Color> {
    const result = await this.db.query<Color>(
      `INSERT INTO colors AS co (name, hex_code, description, status)
       VALUES ($1, $2, $3, $4)
       RETURNING ${TABLE.columns}`,
      [input.name, input.hexCode, input.description, input.status],
    );
    return result.rows[0];
  }

  async update(id: string, input: ColorInput): Promise<Color | null> {
    const result = await this.db.query<Color>(
      `UPDATE colors AS co
          SET name = $1, hex_code = $2, description = $3, status = $4
        WHERE co.id = $5
       RETURNING ${TABLE.columns}`,
      [input.name, input.hexCode, input.description, input.status, id],
    );
    return result.rows[0] ?? null;
  }

  /** Number of products with at least one variant in this colour. */
  async countProducts(colorId: string): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      'SELECT count(DISTINCT product_id)::int AS count FROM product_variants WHERE color_id = $1',
      [colorId],
    );
    return result.rows[0]?.count ?? 0;
  }
}
