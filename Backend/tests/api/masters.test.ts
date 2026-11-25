import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type TestApi, idByName, startApi } from '../helpers/harness.js';

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
type Row = { id: string; name: string; status: string } & Record<string, unknown>;

let api: TestApi;

before(async () => {
  api = await startApi();
});
after(async () => {
  await api.close();
});

describe('health', () => {
  it('reports API and database up', async () => {
    const res = await api.get<{ status: string; database: string }>('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.database, 'up');
  });
});

describe('categories', () => {
  let createdId = '';

  it('lists with pagination, default name order and totals', async () => {
    const res = await api.get<Paged<Row>>('/categories?pageSize=5&page=3');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 13);
    assert.equal(res.body.data.totalPages, 3);
    assert.equal(res.body.data.items.length, 3);
    const first = await api.get<Paged<Row>>('/categories?pageSize=1');
    assert.equal(first.body.data.items[0]?.name, 'Accessories');
  });

  it('searches (every word must match), filters by status and sorts', async () => {
    // Words may match name or description, in any order.
    const search = await api.get<Paged<Row>>('/categories?search=casual%20formal');
    assert.deepEqual(
      search.body.data.items.map((row) => row.name),
      ["Men's Shirts"],
    );
    const both = await api.get<Paged<Row>>("/categories?search=men's%20shirts");
    assert.deepEqual(
      both.body.data.items.map((row) => row.name),
      ["Men's Shirts", "Men's T-Shirts"],
    );
    const inactive = await api.get<Paged<Row>>('/categories?status=inactive');
    assert.deepEqual(
      inactive.body.data.items.map((row) => row.name),
      ['Winter Wear'],
    );
    const desc = await api.get<Paged<Row>>('/categories?sortBy=name&sortOrder=desc&pageSize=1');
    assert.equal(desc.body.data.items[0]?.name, "Women's Western Wear");
  });

  it('treats LIKE wildcards in search literally', async () => {
    const res = await api.get<Paged<Row>>('/categories?search=%25');
    assert.equal(res.body.data.total, 0);
  });

  it('creates with normalised text and default status', async () => {
    const res = await api.post<Row>('/categories', {
      name: '  Party   Wear ',
      description: ' Gowns ',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.name, 'Party Wear');
    assert.equal(res.body.data.description, 'Gowns');
    assert.equal(res.body.data.status, 'active');
    createdId = res.body.data.id;
  });

  it('rejects case-insensitive duplicates with 409 DUPLICATE on the name field', async () => {
    const res = await api.post('/categories', { name: 'PARTY WEAR' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE');
    assert.equal(res.body.error.field, 'name');
  });

  it('reports every validation problem', async () => {
    const res = await api.post('/categories', {
      name: '   ',
      status: 'maybe',
      description: 'x'.repeat(300),
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION');
    assert.deepEqual(res.body.error.details?.map((detail) => detail.field).sort(), [
      'description',
      'name',
      'status',
    ]);
  });

  it('checks existence for live form validation', async () => {
    const taken = await api.get<{ exists: boolean }>(
      '/categories/exists?field=name&value=party%20wear',
    );
    assert.equal(taken.body.data.exists, true);
    const own = await api.get<{ exists: boolean }>(
      `/categories/exists?field=name&value=party%20wear&excludeId=${createdId}`,
    );
    assert.equal(own.body.data.exists, false);
  });

  it('updates, toggles status and gets by id', async () => {
    const updated = await api.put<Row>(`/categories/${createdId}`, {
      name: 'Party Wear',
      description: 'Updated',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data['description'], 'Updated');
    const status = await api.patch<Row>(`/categories/${createdId}/status`, { status: 'inactive' });
    assert.equal(status.body.data.status, 'inactive');
    const fetched = await api.get<Row>(`/categories/${createdId}`);
    assert.equal(fetched.body.data.status, 'inactive');
  });

  it('blocks deleting a category used by products (409 IN_USE)', async () => {
    const shirts = await idByName(api, 'categories', "Men's Shirts");
    const res = await api.delete(`/categories/${shirts}`);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'IN_USE');
    assert.match(res.body.error.message, /used by 1 product/);
  });

  it('deletes an unused category, then 404s', async () => {
    assert.equal((await api.delete(`/categories/${createdId}`)).status, 204);
    const again = await api.get(`/categories/${createdId}`);
    assert.equal(again.status, 404);
    assert.equal(again.body.error.code, 'NOT_FOUND');
  });

  it('validates ids and sort fields', async () => {
    assert.equal((await api.get('/categories/not-a-uuid')).status, 400);
    const sort = await api.get('/categories?sortBy=name;drop');
    assert.equal(sort.status, 400);
    assert.equal(sort.body.error.field, 'sortBy');
  });

  it('lookup returns all, optionally by status', async () => {
    const all = await api.get<Row[]>('/categories/lookup');
    const active = await api.get<Row[]>('/categories/lookup?status=active');
    assert.equal(all.body.data.length, 13);
    assert.equal(active.body.data.length, 12);
  });
});

describe('brands', () => {
  it('blocks deleting a brand used by products', async () => {
    const res = await api.delete(`/brands/${await idByName(api, 'brands', 'Kalaa')}`);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'IN_USE');
  });
});

describe('sizes', () => {
  it('uses natural size order and filters by type', async () => {
    const res = await api.get<Paged<Row>>('/sizes?pageSize=10');
    assert.deepEqual(
      res.body.data.items.map((row) => row.name),
      ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '28', '30', '32'],
    );
    const custom = await api.get<Paged<Row>>('/sizes?type=custom');
    assert.ok(custom.body.data.items.every((row) => row['type'] === 'custom'));
    assert.equal(custom.body.data.total, 5);
  });

  it('allows custom sizes', async () => {
    const res = await api.post<Row>('/sizes', {
      name: '5.5 m',
      type: 'custom',
      description: 'Saree length',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data['type'], 'custom');
  });

  it('blocks deleting a size used by variants', async () => {
    const res = await api.delete(`/sizes/${await idByName(api, 'sizes', 'M')}`);
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /variants of \d+ products/);
  });
});

describe('colors', () => {
  it('normalises HEX codes and rejects invalid ones', async () => {
    const ok = await api.post<Row>('/colors', { name: 'Teal', hexCode: '0f766e' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data['hexCode'], '#0F766E');
    const short = await api.post<Row>('/colors', { name: 'Ash', hexCode: '#abc' });
    assert.equal(short.body.data['hexCode'], '#AABBCC');
    const bad = await api.post('/colors', { name: 'Bad', hexCode: '#12G' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.field, 'hexCode');
  });
});

describe('suppliers', () => {
  const supplier = {
    name: 'Erode Handlooms',
    contactPerson: 'Kumar',
    mobile: '+91 94430 55555',
    email: 'Sales@ErodeHandlooms.example.com',
    address: '1, Main Road',
    city: 'Erode',
    state: 'Tamil Nadu',
    pincode: '638001',
    gstNumber: '33aabce1234f1zc',
    openingBalance: 15000.5,
  };

  it('creates with normalised mobile, email and GSTIN', async () => {
    const res = await api.post<Row>('/suppliers', supplier);
    assert.equal(res.status, 201);
    assert.equal(res.body.data['mobile'], '9443055555');
    assert.equal(res.body.data['email'], 'sales@erodehandlooms.example.com');
    assert.equal(res.body.data['gstNumber'], '33AABCE1234F1ZC');
    assert.equal(res.body.data['openingBalance'], 15000.5);
  });

  it('validates mobile, email, pincode and GSTIN check digit', async () => {
    const res = await api.post('/suppliers', {
      ...supplier,
      name: 'Another',
      mobile: '12345',
      email: 'bad@mail',
      pincode: '0123',
      gstNumber: '33AABCE1234F1Z9',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details?.map((detail) => detail.field).sort(), [
      'email',
      'gstNumber',
      'mobile',
      'pincode',
    ]);
  });

  it('flags a GSTIN registered in a different state', async () => {
    const res = await api.post('/suppliers', {
      ...supplier,
      name: 'Another',
      gstNumber: '',
      state: 'Kerala',
    });
    assert.equal(res.status, 201);
    const mismatch = await api.post('/suppliers', { ...supplier, name: 'Third', state: 'Kerala' });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.error.field, 'gstNumber');
    assert.match(mismatch.body.error.message, /registered in Tamil Nadu/);
  });

  it('rejects a duplicate GSTIN and allows several unregistered suppliers', async () => {
    const dup = await api.post('/suppliers', { ...supplier, name: 'Fourth' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.field, 'gstNumber');
    const unregistered = await api.post('/suppliers', {
      ...supplier,
      name: 'Fifth',
      gstNumber: '',
    });
    assert.equal(unregistered.status, 201);
  });

  it('searches by name and mobile', async () => {
    const byMobile = await api.get<Paged<Row>>('/suppliers?search=9825012345');
    assert.deepEqual(
      byMobile.body.data.items.map((row) => row.name),
      ['Shree Ganesh Textiles'],
    );
  });
});

describe('customers', () => {
  it('does not require a GST number', async () => {
    const res = await api.post<Row>('/customers', { name: 'Revathi S', mobile: '9001122334' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data['gstNumber'], '');
    assert.equal(res.body.data['openingBalance'], 0);
  });

  it('keeps mobile numbers unique', async () => {
    const res = await api.post('/customers', { name: 'Someone', mobile: '98765 43210' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.field, 'mobile');
  });

  it('searches by mobile number', async () => {
    const res = await api.get<Paged<Row>>('/customers?search=9001122334');
    assert.deepEqual(
      res.body.data.items.map((row) => row.name),
      ['Revathi S'],
    );
  });
});

describe('HTTP errors', () => {
  it('returns 404 NOT_FOUND for unknown routes', async () => {
    const res = await api.get('/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('returns 400 BAD_REQUEST for malformed JSON', async () => {
    const response = await api.raw('POST', '/customers', '{"name":');
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'BAD_REQUEST');
  });
});
