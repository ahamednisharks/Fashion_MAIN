import { type Queryable, pool } from '../../config/database.js';
import { type MasterTable, MasterRepository } from '../../common/crud/master.repository.js';
import type { Customer, CustomerInput } from './customers.schema.js';

const TABLE: MasterTable = {
  table: 'customers',
  alias: 'cu',
  columns: `cu.id, cu.name, cu.mobile, cu.email, cu.address, cu.city, cu.state, cu.pincode,
            cu.gst_number AS "gstNumber", cu.opening_balance AS "openingBalance", cu.status,
            cu.created_at AS "createdAt", cu.updated_at AS "updatedAt"`,
  searchSql: (p) =>
    `concat_ws(' ', cu.name, cu.mobile, cu.email, cu.city, cu.gst_number) ILIKE ${p}`,
  sortable: {
    name: 'lower(cu.name)',
    mobile: 'cu.mobile',
    city: 'lower(cu.city)',
    openingBalance: 'cu.opening_balance',
    status: 'cu.status',
    createdAt: 'cu.created_at',
    updatedAt: 'cu.updated_at',
  },
  defaultOrder: 'lower(cu.name)',
  uniqueFields: { mobile: 'cu.mobile', gstNumber: 'cu.gst_number' },
};

function values(input: CustomerInput): unknown[] {
  return [
    input.name,
    input.mobile,
    input.email,
    input.address,
    input.city,
    input.state,
    input.pincode,
    input.gstNumber,
    input.openingBalance,
    input.status,
  ];
}

export class CustomersRepository extends MasterRepository<Customer, CustomerInput> {
  constructor(db: Queryable = pool) {
    super(TABLE, db);
  }

  async create(input: CustomerInput): Promise<Customer> {
    const result = await this.db.query<Customer>(
      `INSERT INTO customers AS cu
         (name, mobile, email, address, city, state, pincode, gst_number, opening_balance, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${TABLE.columns}`,
      values(input),
    );
    return result.rows[0];
  }

  async update(id: string, input: CustomerInput): Promise<Customer | null> {
    const result = await this.db.query<Customer>(
      `UPDATE customers AS cu
          SET name = $1, mobile = $2, email = $3, address = $4, city = $5, state = $6,
              pincode = $7, gst_number = $8, opening_balance = $9, status = $10
        WHERE cu.id = $11
       RETURNING ${TABLE.columns}`,
      [...values(input), id],
    );
    return result.rows[0] ?? null;
  }
}
