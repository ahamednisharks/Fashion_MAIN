import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { migrationName, selectMigrations } from '../../database/migrations/select-migrations.js';

const FILES = [
  '001_master_data.sql',
  '002_auth.sql',
  '003_billing.sql',
  '004_purchase_orders.sql',
  '005_barcodes.sql',
  '006_shop_logo.sql',
  '007_purchase_entries.sql',
  '008_stock.sql',
  '009_stock_adjustments.sql',
];

const pick = (...requests: string[]) => selectMigrations(FILES, requests);

describe('choosing migrations by name', () => {
  it('matches screen names, singular or plural, any separator', () => {
    for (const name of [
      'purchase-entry',
      'purchase-entries',
      'purchase_entries',
      'Purchase Entry',
      'entry',
      'pe',
    ]) {
      assert.deepEqual(pick(name), ['007_purchase_entries.sql'], name);
    }
    assert.deepEqual(pick('purchase-order'), ['004_purchase_orders.sql']);
    assert.deepEqual(pick('billing'), ['003_billing.sql']);
    assert.deepEqual(pick('barcode-assign'), ['005_barcodes.sql']);
    assert.deepEqual(pick('items'), ['005_barcodes.sql']);
    assert.deepEqual(pick('shop-logo'), ['006_shop_logo.sql']);
    assert.deepEqual(pick('logo'), ['006_shop_logo.sql']);
    assert.deepEqual(pick('users'), ['002_auth.sql']);
    assert.deepEqual(pick('masters'), ['001_master_data.sql']);
    // "stock" is the exact name of 008, so it does not also pick 009.
    assert.deepEqual(pick('stock'), ['008_stock.sql']);
    for (const name of [
      'stock-adjustment',
      'stock adjustments',
      'adjustment',
      'adj',
      'opening-stock',
    ]) {
      assert.deepEqual(pick(name), ['009_stock_adjustments.sql'], name);
    }
  });

  it('matches numbers and keeps file order without duplicates', () => {
    assert.deepEqual(pick('7'), ['007_purchase_entries.sql']);
    assert.deepEqual(pick('004'), ['004_purchase_orders.sql']);
    assert.deepEqual(pick('purchase-entry', '4', '007'), [
      '004_purchase_orders.sql',
      '007_purchase_entries.sql',
    ]);
  });

  it('refuses unknown and ambiguous names, listing the migrations', () => {
    assert.throws(
      () => pick('wholesale'),
      /No migration matches "wholesale".*009 stock-adjustments/,
    );
    assert.throws(() => pick('99'), /No migration matches "99"/);
    assert.throws(
      () => pick('purchase'),
      /"purchase" matches 004 purchase-orders, 007 purchase-entries/,
    );
  });

  it('names files the way they are typed', () => {
    assert.equal(migrationName('007_purchase_entries.sql'), 'purchase-entries');
    assert.equal(migrationName('001_master_data.sql'), 'master-data');
  });
});
