import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_RUNNING_NUMBER,
  ean13CheckDigit,
  isValidEan13,
  shopBarcode,
} from '../../src/modules/items/shop-barcode.js';

// The same cases are tested in Frontend/src/app/shared/barcode/ean13.spec.ts.
describe('shop barcodes (EAN-13)', () => {
  it('computes the EAN-13 check digit', () => {
    assert.equal(ean13CheckDigit('400638133393'), 1); // 4006381333931 (GS1 example)
    assert.equal(ean13CheckDigit('890123451001'), 8);
    assert.equal(ean13CheckDigit('200000000001'), 5);
    assert.equal(ean13CheckDigit('200000000010'), 7);
    assert.equal(ean13CheckDigit('000000000000'), 0);
  });

  it('builds prefix + 9-digit running number + check digit', () => {
    assert.equal(shopBarcode('200', 1), '2000000000015');
    assert.equal(shopBarcode('200', 2), '2000000000022');
    assert.equal(shopBarcode('200', 10), '2000000000107');
    assert.equal(shopBarcode('245', 123456789), '2451234567896');
    assert.equal(shopBarcode('299', MAX_RUNNING_NUMBER).length, 13);
  });

  it('validates EAN-13 codes', () => {
    assert.ok(isValidEan13('4006381333931'));
    assert.ok(isValidEan13('2000000000015'));
    assert.ok(!isValidEan13('2000000000016'));
    // The demo shirts' barcodes are not real EAN-13 numbers (labels print them as Code 128).
    assert.ok(!isValidEan13('8901234510011'));
    assert.ok(!isValidEan13('200000000001'));
    assert.ok(!isValidEan13('20000000000A5'));
  });

  it('refuses prefixes outside the in-store range and bad running numbers', () => {
    assert.throws(() => shopBarcode('890', 1));
    assert.throws(() => shopBarcode('20', 1));
    assert.throws(() => shopBarcode('200', 0));
    assert.throws(() => shopBarcode('200', MAX_RUNNING_NUMBER + 1));
    assert.throws(() => shopBarcode('200', 1.5));
  });
});
