import '../helpers/test-env.js';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { gstinField, hexColorField, mobileField } from '../../src/common/validators/fields.js';
import { checkGstin, gstinCheckChar, stateFromGstin } from '../../src/common/validators/gstin.js';
import { escapeLike, searchTokens } from '../../src/common/utils/sql.js';
import { orderByClause } from '../../src/common/utils/sorting.js';

describe('GSTIN', () => {
  it('accepts published, checksum-valid GSTINs', () => {
    assert.equal(checkGstin('27AAPFU0939F1ZV'), null);
    assert.equal(checkGstin('29AAGCB7383J1Z4'), null);
  });

  it('detects format, state and check-digit problems', () => {
    assert.equal(checkGstin('27AAPFU0939F1Z'), 'format');
    assert.equal(checkGstin('27AAPFU0939F1ZA'), 'checksum');
    const first14 = '99AAPFU0939F1Z';
    assert.equal(checkGstin(first14 + gstinCheckChar(first14)), 'state');
  });

  it('maps the state code', () => {
    assert.equal(stateFromGstin('33ABCPT7712M1ZD')?.name, 'Tamil Nadu');
  });

  it('field schema uppercases and allows empty values', () => {
    assert.equal(gstinField.parse('33abcpt7712m1zd'), '33ABCPT7712M1ZD');
    assert.equal(gstinField.parse(null), '');
    assert.equal(gstinField.safeParse('33ABCPT7712M1ZA').success, false);
  });
});

describe('field normalisation', () => {
  it('normalises Indian mobile numbers', () => {
    assert.equal(mobileField.parse('+91 98765 43210'), '9876543210');
    assert.equal(mobileField.parse('098765-43210'), '9876543210');
    assert.equal(mobileField.safeParse('5876543210').success, false);
  });

  it('normalises HEX colours', () => {
    assert.equal(hexColorField.parse('#abc'), '#AABBCC');
    assert.equal(hexColorField.parse('0f766e'), '#0F766E');
    assert.equal(hexColorField.safeParse('#12G').success, false);
  });
});

describe('SQL helpers', () => {
  it('escapes LIKE wildcards', () => {
    assert.equal(escapeLike('50%_off\\'), '50\\%\\_off\\\\');
  });

  it('splits search words', () => {
    assert.deepEqual(searchTokens('  silk   saree '), ['silk', 'saree']);
  });

  it('only sorts by allowlisted expressions', () => {
    const sortable = { name: 'lower(c.name)' };
    const base = {
      sortOrder: 'desc' as const,
      sortable,
      defaultOrder: 'lower(c.name)',
      tiebreaker: 'c.id',
    };
    assert.equal(
      orderByClause({ ...base, sortBy: 'name' }),
      'ORDER BY lower(c.name) DESC NULLS LAST, c.id',
    );
    assert.equal(
      orderByClause({ ...base, sortBy: 'name; DROP TABLE categories' }),
      'ORDER BY lower(c.name), c.id',
    );
  });
});
