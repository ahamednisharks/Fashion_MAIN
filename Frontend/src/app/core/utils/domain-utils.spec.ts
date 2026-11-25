import { checkGstin, gstinCheckChar, stateFromGstin } from './gstin';
import { compareSizes } from './size-order';
import { buildSku, colorSkuCode, normalizeHex } from './sku';
import { compareValues, nameInitials, normalizeKey } from './text';

describe('GSTIN', () => {
  it('accepts published, checksum-valid GSTINs', () => {
    expect(checkGstin('27AAPFU0939F1ZV')).toBeNull();
    expect(checkGstin('29AAGCB7383J1Z4')).toBeNull();
  });

  it('rejects a wrong check digit', () => {
    expect(checkGstin('27AAPFU0939F1ZA')).toBe('checksum');
  });

  it('rejects bad format and unknown state codes', () => {
    expect(checkGstin('27AAPFU0939F1Z')).toBe('format');
    const first14 = '99AAPFU0939F1Z';
    expect(checkGstin(first14 + gstinCheckChar(first14))).toBe('state');
  });

  it('resolves the state from the first two digits', () => {
    expect(stateFromGstin('33ABCPT7712M1ZD')?.name).toBe('Tamil Nadu');
    expect(stateFromGstin('X3')).toBeUndefined();
  });
});

describe('SKU helpers', () => {
  it('builds short colour codes', () => {
    expect(colorSkuCode('Black')).toBe('BLK');
    expect(colorSkuCode('White')).toBe('WHT');
    expect(colorSkuCode('Navy Blue')).toBe('NBL');
    expect(colorSkuCode('Red')).toBe('RED');
  });

  it('builds a SKU from product code, design, colour and size', () => {
    expect(
      buildSku({ productCode: 'msh-1001', designNo: '101', colorName: 'Black', sizeName: 'M' }),
    ).toBe('MSH-1001-101-BLK-M');
    expect(
      buildSku({
        productCode: 'SAR-4001',
        designNo: '',
        colorName: 'Maroon',
        sizeName: 'Free Size',
      }),
    ).toBe('SAR-4001-MRN-FREESIZE');
  });

  it('normalises HEX codes', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('0f766e')).toBe('#0F766E');
    expect(normalizeHex('#12G')).toBe('');
  });
});

describe('size ordering', () => {
  it('orders clothing S→XXL, then numeric ascending, then custom', () => {
    const sizes = [
      { name: 'Free Size', type: 'custom' as const },
      { name: '32', type: 'numeric' as const },
      { name: 'XL', type: 'clothing' as const },
      { name: '28', type: 'numeric' as const },
      { name: 'S', type: 'clothing' as const },
      { name: 'M', type: 'clothing' as const },
    ];
    expect([...sizes].sort(compareSizes).map((s) => s.name)).toEqual([
      'S',
      'M',
      'XL',
      '28',
      '32',
      'Free Size',
    ]);
  });
});

describe('text helpers', () => {
  it('normalises keys for case/space-insensitive comparison', () => {
    expect(normalizeKey("  Men's   Shirts ")).toBe("men's shirts");
  });

  it('makes up to two initials from a name', () => {
    expect(nameInitials('Kachi Fashions')).toBe('KF');
    expect(nameInitials('  sri  lakshmi silks ')).toBe('SL');
    expect(nameInitials('Kalaa')).toBe('K');
    expect(nameInitials('A & B Textiles')).toBe('AB');
    expect(nameInitials('7 Hills Garments')).toBe('7H');
    expect(nameInitials('')).toBe('');
    expect(nameInitials(null)).toBe('');
  });

  it('compares naturally and puts empty values last', () => {
    expect(['10', '9', '', 'a'].sort(compareValues)).toEqual(['9', '10', 'a', '']);
  });
});
