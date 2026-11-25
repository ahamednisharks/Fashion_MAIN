/**
 * Short, readable colour code for SKUs: "Black" → BLK, "Navy Blue" → NBL, "Red" → RED.
 */
export function colorSkuCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/CK/g, 'K')
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (!words.length) {
    return '';
  }
  const consonants = (word: string) => word.slice(1).replace(/[AEIOU]/g, '');
  const last = words[words.length - 1];
  let code =
    words.length > 1
      ? words.map((word) => word[0]).join('') + consonants(last)
      : words[0][0] + consonants(words[0]);
  if (code.length < 3) {
    code = words.join('').slice(0, 3);
  }
  return code.slice(0, 3);
}

function skuPart(value: string, maxLength: number): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}

/** Builds a variant SKU such as "MSH-1001-101-BLK-M" from its identifying parts. */
export function buildSku(parts: {
  productCode: string;
  designNo: string;
  colorName: string;
  sizeName: string;
}): string {
  return [
    skuPart(parts.productCode, 20),
    skuPart(parts.designNo, 12),
    colorSkuCode(parts.colorName),
    skuPart(parts.sizeName, 8),
  ]
    .filter(Boolean)
    .join('-');
}

/** Normalises #abc / #AABBCC / aabbcc to uppercase #AABBCC. Returns '' when invalid. */
export function normalizeHex(value: string): string {
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()}`;
  }
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : '';
}
