import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { type TestApi, idByName, startApi } from '../helpers/harness.js';

interface Variant {
  id: string;
  designNo: string;
  sizeId: string;
  sizeName: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  sku: string;
  barcode: string;
  sellingPrice: number | null;
  mrp: number | null;
  position: number;
}
interface Product {
  id: string;
  name: string;
  code: string;
  categoryId: string;
  categoryName: string;
  brandName: string | null;
  status: string;
  variantCount: number;
  variants: Variant[];
}
interface Paged<T> {
  items: T[];
  total: number;
}

let api: TestApi;
const ids: Record<string, string> = {};

before(async () => {
  api = await startApi();
  ids['kurtis'] = await idByName(api, 'categories', "Women's Kurtis");
  ids['sarees'] = await idByName(api, 'categories', 'Sarees');
  ids['winter'] = await idByName(api, 'categories', 'Winter Wear'); // inactive
  ids['kalaa'] = await idByName(api, 'brands', 'Kalaa');
  for (const size of ['S', 'M', 'L', 'XL']) ids[size] = await idByName(api, 'sizes', size);
  for (const color of ['Black', 'White', 'Maroon', 'Neon Green'])
    ids[color] = await idByName(api, 'colors', color);
});
after(async () => {
  await api.close();
});

function variant(
  designNo: string,
  size: string,
  color: string,
  extra: Record<string, unknown> = {},
) {
  return {
    designNo,
    sizeId: ids[size],
    colorId: ids[color],
    sku: `ANK-501-${designNo}-${color.slice(0, 3)}-${size}`.toUpperCase(),
    barcode: '',
    ...extra,
  };
}

function product(extra: Record<string, unknown> = {}) {
  return {
    name: 'Anarkali Kurta',
    code: 'ank-501',
    categoryId: ids['kurtis'],
    brandId: ids['kalaa'],
    productType: 'readymade',
    hsnCode: '6204',
    gstRate: 5,
    mrp: 1999,
    sellingPrice: 1799,
    purchasePrice: 950,
    barcode: '',
    variants: [
      variant('AK9', 'S', 'Black'),
      variant('AK9', 'M', 'Black'),
      variant('AK9', 'M', 'White'),
    ],
    ...extra,
  };
}

describe('product list', () => {
  it('returns summaries with joined names and variant counts', async () => {
    const res = await api.get<Paged<Product>>('/products?pageSize=50');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 9);
    const shirt = res.body.data.items.find((p) => p.code === 'MSH-1001');
    assert.equal(shirt?.categoryName, "Men's Shirts");
    assert.equal(shirt?.brandName, 'Urban Weave');
    assert.equal(shirt?.variantCount, 5);
    assert.equal('variants' in (shirt ?? {}), false);
  });

  it('search matches variant SKUs and barcodes', async () => {
    const bySku = await api.get<Paged<Product>>('/products?search=msh-1001-101-blk-m');
    assert.deepEqual(
      bySku.body.data.items.map((p) => p.name),
      ["Men's Cotton Casual Shirt"],
    );
    const byBarcode = await api.get<Paged<Product>>('/products?search=8901234510059');
    assert.equal(byBarcode.body.data.total, 1);
  });

  it('filters and sorts', async () => {
    const sarees = await api.get<Paged<Product>>(`/products?categoryId=${ids['sarees']}`);
    assert.deepEqual(
      sarees.body.data.items.map((p) => p.code),
      ['SAR-4001'],
    );
    const mostVariants = await api.get<Paged<Product>>(
      '/products?sortBy=variantCount&sortOrder=desc&pageSize=1',
    );
    assert.equal(mostVariants.body.data.items[0]?.code, 'KRT-3001');
  });
});

describe('create product with variants', () => {
  let created: Product;

  it('creates the product and its variants in one request', async () => {
    const res = await api.post<Product>('/products', product());
    assert.equal(res.status, 201, JSON.stringify(res.body.error));
    created = res.body.data;
    assert.equal(created.code, 'ANK-501');
    assert.equal(created.brandName, 'Kalaa');
    assert.equal(created.variantCount, 3);
    assert.deepEqual(
      created.variants.map((v) => v.position),
      [0, 1, 2],
    );
    assert.deepEqual(
      created.variants.map((v) => `${v.sizeName}/${v.colorName}`),
      ['S/Black', 'M/Black', 'M/White'],
    );
    assert.equal(created.variants[0]?.colorHex, '#1C1C1C');
  });

  it('rejects a duplicate product code', async () => {
    const res = await api.post('/products', product({ name: 'Copy', variants: [] }));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.field, 'code');
  });

  it('validates the payload with variant-level field paths', async () => {
    const res = await api.post('/products', {
      ...product({ code: 'NEW-1', sellingPrice: 2500 }),
      variants: [
        variant('X1', 'S', 'Black', { sku: 'NEW-1-A', sellingPrice: 2100 }),
        variant('x1', 'S', 'Black', { sku: 'new-1-a' }),
      ],
    });
    assert.equal(res.status, 400);
    const fields = res.body.error.details?.map((d) => d.field);
    assert.ok(fields?.includes('sellingPrice'), String(fields));
    assert.ok(fields?.includes('variants.1.sizeId'), String(fields));
    assert.ok(fields?.includes('variants.1.sku'), String(fields));
  });

  it('keeps SKUs unique across products', async () => {
    const res = await api.post(
      '/products',
      product({
        code: 'NEW-2',
        variants: [variant('Z', 'S', 'Black', { sku: 'msh-1001-101-blk-m' })],
      }),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error.field, 'variants.0.sku');
    assert.match(res.body.error.message, /Men's Cotton Casual Shirt/);
  });

  it('keeps product and variant barcodes in one namespace', async () => {
    const productBarcode = await api.post(
      '/products',
      product({ code: 'NEW-3', barcode: '8901234510011', variants: [] }),
    );
    assert.equal(productBarcode.status, 409);
    assert.equal(productBarcode.body.error.field, 'barcode');
    const variantBarcode = await api.post(
      '/products',
      product({
        code: 'NEW-4',
        variants: [variant('Z', 'S', 'Black', { sku: 'NEW-4-A', barcode: '8909876500017' })],
      }),
    );
    assert.equal(variantBarcode.status, 409);
    assert.equal(variantBarcode.body.error.field, 'variants.0.barcode');
  });

  it('rejects missing or inactive references for new products', async () => {
    const inactiveCategory = await api.post(
      '/products',
      product({ code: 'NEW-5', categoryId: ids['winter'], variants: [] }),
    );
    assert.equal(inactiveCategory.status, 400);
    assert.equal(inactiveCategory.body.error.field, 'categoryId');
    const inactiveColor = await api.post(
      '/products',
      product({
        code: 'NEW-6',
        variants: [variant('Z', 'S', 'Neon Green', { sku: 'NEW-6-A' })],
      }),
    );
    assert.equal(inactiveColor.status, 400);
    assert.equal(inactiveColor.body.error.field, 'variants.0.colorId');
    const missing = await api.post(
      '/products',
      product({
        code: 'NEW-7',
        categoryId: '3f1c1c3e-1111-4a5b-8c9d-123456789abc',
        variants: [],
      }),
    );
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.field, 'categoryId');
  });

  it('accepts "" as "no brand"', async () => {
    const res = await api.post<Product>(
      '/products',
      product({ code: 'NOBRAND-1', brandId: '', variants: [] }),
    );
    assert.equal(res.status, 201);
    assert.equal(res.body.data.brandName, null);
  });

  describe('update (variant sync)', () => {
    it('updates, swaps SKUs, adds and removes variants atomically', async () => {
      const [first, second, third] = created.variants;
      assert.ok(first && second && third);
      const res = await api.put<Product>(
        `/products/${created.id}`,
        product({
          name: 'Anarkali Kurta Set',
          variants: [
            { ...variant('AK9', 'S', 'Black'), id: first.id, sku: second.sku },
            { ...variant('AK9', 'M', 'Black'), id: second.id, sku: first.sku, mrp: 2499 },
            variant('AK9', 'L', 'Maroon'),
          ],
        }),
      );
      assert.equal(res.status, 200, JSON.stringify(res.body.error));
      const updated = res.body.data;
      assert.equal(updated.name, 'Anarkali Kurta Set');
      assert.equal(updated.variantCount, 3);
      assert.equal(updated.variants[0]?.id, first.id);
      assert.equal(updated.variants[0]?.sku, second.sku);
      assert.equal(updated.variants[1]?.sku, first.sku);
      assert.equal(updated.variants[1]?.mrp, 2499);
      assert.equal(
        updated.variants.some((v) => v.id === third.id),
        false,
      );
      assert.equal(updated.variants[2]?.colorName, 'Maroon');
      created = updated;
    });

    it("rejects another product's variant id", async () => {
      const shirt = await api.get<Paged<Product>>('/products?search=MSH-1001');
      const shirtDetail = await api.get<Product>(`/products/${shirt.body.data.items[0]?.id}`);
      const foreign = shirtDetail.body.data.variants[0];
      const res = await api.put(
        `/products/${created.id}`,
        product({
          variants: [{ ...variant('Q', 'S', 'White'), id: foreign?.id }],
        }),
      );
      assert.equal(res.status, 400);
      assert.equal(res.body.error.field, 'variants.0.id');
    });

    it('keeps an existing reference after it is deactivated, but not a newly chosen one', async () => {
      await api.patch(`/categories/${ids['kurtis']}/status`, { status: 'inactive' });
      const unchanged = await api.put(
        `/products/${created.id}`,
        product({
          name: created.name,
          variants: created.variants.map((v) => ({ ...v })),
        }),
      );
      assert.equal(unchanged.status, 200, JSON.stringify(unchanged.body.error));
      const changed = await api.put(
        `/products/${created.id}`,
        product({ categoryId: ids['winter'], variants: [] }),
      );
      assert.equal(changed.status, 400);
      assert.equal(changed.body.error.field, 'categoryId');
      await api.patch(`/categories/${ids['kurtis']}/status`, { status: 'active' });
    });
  });

  describe('variants sub-resource', () => {
    let variantId = '';

    it('adds a variant at the end', async () => {
      const res = await api.post<Variant>(
        `/products/${created.id}/variants`,
        variant('AK9', 'XL', 'White'),
      );
      assert.equal(res.status, 201, JSON.stringify(res.body.error));
      assert.equal(res.body.data.position, 3);
      variantId = res.body.data.id;
    });

    it('rejects a duplicate combination, SKU or over-MRP price', async () => {
      const combo = await api.post(
        `/products/${created.id}/variants`,
        variant('ak9', 'XL', 'White', { sku: 'OTHER-1' }),
      );
      assert.equal(combo.status, 409);
      assert.equal(combo.body.error.field, 'sizeId');
      const sku = await api.post(
        `/products/${created.id}/variants`,
        variant('B', 'S', 'White', { sku: 'JNS-2001-BH-11-BLK-32' }),
      );
      assert.equal(sku.status, 409);
      assert.equal(sku.body.error.field, 'sku');
      const price = await api.post(
        `/products/${created.id}/variants`,
        variant('C', 'S', 'White', { sku: 'OTHER-2', sellingPrice: 5000 }),
      );
      assert.equal(price.status, 400);
      assert.equal(price.body.error.field, 'sellingPrice');
    });

    it('updates and deletes a variant', async () => {
      const update = await api.put<Variant>(
        `/products/${created.id}/variants/${variantId}`,
        variant('AK9', 'XL', 'White', { sellingPrice: 1899, barcode: '8900000000017' }),
      );
      assert.equal(update.status, 200, JSON.stringify(update.body.error));
      assert.equal(update.body.data.sellingPrice, 1899);
      assert.equal(update.body.data.position, 3);
      assert.equal((await api.delete(`/products/${created.id}/variants/${variantId}`)).status, 204);
      const list = await api.get<Variant[]>(`/products/${created.id}/variants`);
      assert.equal(list.body.data.length, 3);
      assert.equal((await api.get(`/products/${created.id}/variants/${variantId}`)).status, 404);
    });
  });

  it('serialises concurrent saves so a SKU can only be claimed once', async () => {
    const make = (code: string) =>
      api.post(
        '/products',
        product({ code, variants: [variant('R', 'S', 'White', { sku: 'RACE-SKU-1' })] }),
      );
    const results = await Promise.all([make('RACE-1'), make('RACE-2'), make('RACE-3')]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
  });

  it('answers existence checks for code, SKU and barcode', async () => {
    const code = await api.get<{ exists: boolean }>('/products/exists?field=code&value=ank-501');
    const ownCode = await api.get<{ exists: boolean }>(
      `/products/exists?field=code&value=ank-501&excludeId=${created.id}`,
    );
    const sku = await api.get<{ exists: boolean }>('/products/exists?field=sku&value=race-sku-1');
    const barcode = await api.get<{ exists: boolean }>(
      '/products/exists?field=barcode&value=8909876500017',
    );
    assert.deepEqual(
      [
        code.body.data.exists,
        ownCode.body.data.exists,
        sku.body.data.exists,
        barcode.body.data.exists,
      ],
      [true, false, true, true],
    );
  });

  it('changes status and deletes the product with its variants', async () => {
    const status = await api.patch<Product>(`/products/${created.id}/status`, {
      status: 'inactive',
    });
    assert.equal(status.body.data.status, 'inactive');
    assert.equal((await api.delete(`/products/${created.id}`)).status, 204);
    assert.equal((await api.get(`/products/${created.id}`)).status, 404);
    assert.equal((await api.get(`/products/${created.id}/variants`)).status, 404);
  });
});
