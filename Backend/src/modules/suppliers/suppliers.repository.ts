import { type Queryable, pool } from '../../config/database.js';
import { type MasterTable, MasterRepository } from '../../common/crud/master.repository.js';
import type { Supplier, SupplierInput } from './suppliers.schema.js';

const TABLE: MasterTable = {
  table: 'suppliers',
  alias: 'sp',
  columns: `sp.id, sp.name, sp.contact_person AS "contactPerson", sp.mobile, sp.email,
            sp.address, sp.city, sp.state, sp.pincode, sp.gst_number AS "gstNumber",
            sp.opening_balance AS "openingBalance", sp.status,
            sp.created_at AS "createdAt", sp.updated_at AS "updatedAt"`,
  searchSql: (p) =>
    `concat_ws(' ', sp.name, sp.contact_person, sp.mobile, sp.email, sp.city, sp.gst_number) ILIKE ${p}`,
  sortable: {
    name: 'lower(sp.name)',
    city: 'lower(sp.city)',
    state: 'sp.state',
    openingBalance: 'sp.opening_balance',
    status: 'sp.status',
    createdAt: 'sp.created_at',
    updatedAt: 'sp.updated_at',
  },
  defaultOrder: 'lower(sp.name)',
  filters: { state: 'sp.state' },
  uniqueFields: { name: 'sp.name', gstNumber: 'sp.gst_number', mobile: 'sp.mobile' },
};

function values(input: SupplierInput): unknown[] {
  return [
    input.name,
    input.contactPerson,
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

export class SuppliersRepository extends MasterRepository<Supplier, SupplierInput> {
  constructor(db: Queryable = pool) {
    super(TABLE, db);
  }

  async create(input: SupplierInput): Promise<Supplier> {
    const result = await this.db.query<Supplier>(
      `INSERT INTO suppliers AS sp
         (name, contact_person, mobile, email, address, city, state, pincode,
          gst_number, opening_balance, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${TABLE.columns}`,
      values(input),
    );
    return result.rows[0];
  }

  async update(id: string, input: SupplierInput): Promise<Supplier | null> {
    const result = await this.db.query<Supplier>(
      `UPDATE suppliers AS sp
          SET name = $1, contact_person = $2, mobile = $3, email = $4, address = $5,
              city = $6, state = $7, pincode = $8, gst_number = $9, opening_balance = $10,
              status = $11
        WHERE sp.id = $12
       RETURNING ${TABLE.columns}`,
      [...values(input), id],
    );
    return result.rows[0] ?? null;
  }
}
