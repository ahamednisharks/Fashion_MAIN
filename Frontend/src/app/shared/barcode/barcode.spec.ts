import { barcodePattern } from './barcode-pattern';
import { canEncodeCode128, code128Values, encodeCode128 } from './code128';
import { ean13CheckDigit, encodeEan13, isValidEan13 } from './ean13';

// Reference module strings were produced with an independent encoder (JsBarcode 3) and match.

describe('EAN-13', () => {
  // The same cases are tested in Backend/tests/unit/shop-barcode.test.ts.
  it('computes the check digit', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(ean13CheckDigit('890123451001')).toBe(8);
    expect(ean13CheckDigit('200000000001')).toBe(5);
    expect(ean13CheckDigit('200000000010')).toBe(7);
    expect(ean13CheckDigit('000000000000')).toBe(0);
  });

  it('validates codes', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('2000000000015')).toBe(true);
    expect(isValidEan13('2000000000016')).toBe(false);
    expect(isValidEan13('8901234510011')).toBe(false);
    expect(isValidEan13('200000000001')).toBe(false);
  });

  it('encodes the bar pattern', () => {
    expect(encodeEan13('2000000000015')).toBe(
      '10100011010001101010011101001110001101010011101010111001011100101110010111001011001101001110101',
    );
    expect(encodeEan13('4006381333931')).toBe(
      '10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101',
    );
    expect(encodeEan13('2000000000015')).toHaveLength(95);
    expect(() => encodeEan13('2000000000016')).toThrow();
  });
});

describe('Code 128', () => {
  it('uses code set B for text and computes the checksum', () => {
    // PJJ123C: 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879 → 879 mod 103 = 55.
    expect(code128Values('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
    expect(encodeCode128('ABC-123')).toBe(
      '1101001000010100011000100010110001000100011010011011100100111001101100111001011001011100101100001001100011101011',
    );
  });

  it('uses code set C for digits (the last odd digit in set B)', () => {
    expect(encodeCode128('123456')).toBe(
      '11010011100101100111001000101100011100010110100011011101100011101011',
    );
    // Start C, "12", switch to B, "3"; checksum 105 + 12·1 + 100·2 + 19·3 = 374 → 374 mod 103 = 65.
    expect(code128Values('123')).toEqual([105, 12, 100, 19, 65, 106]);
    expect(encodeCode128('123')).toHaveLength(5 * 11 + 13);
  });

  it('only encodes printable ASCII', () => {
    expect(canEncodeCode128('ABC-123')).toBe(true);
    expect(canEncodeCode128('')).toBe(false);
    expect(canEncodeCode128('₹100')).toBe(false);
  });
});

describe('barcodePattern', () => {
  it('prints valid EAN-13 numbers as EAN-13 and everything else as Code 128', () => {
    expect(barcodePattern('2000000000015')?.symbology).toBe('ean13');
    expect(barcodePattern('8901234510011')?.symbology).toBe('code128');
    expect(barcodePattern('MSH-1001')?.symbology).toBe('code128');
    expect(barcodePattern('')).toBeNull();
    expect(barcodePattern('₹')).toBeNull();
  });

  it('adds quiet zones and merges modules into bars', () => {
    const pattern = barcodePattern('2000000000015');
    expect(pattern?.width).toBe(11 + 95 + 7);
    // Start guard 101: two one-module bars right after the 11-module quiet zone.
    expect(pattern?.bars.slice(0, 2)).toEqual([
      { x: 11, width: 1 },
      { x: 13, width: 1 },
    ]);
    const modules = pattern?.bars.reduce((sum, bar) => sum + bar.width, 0);
    expect(modules).toBe(encodeEan13('2000000000015').replace(/0/g, '').length);
  });
});
