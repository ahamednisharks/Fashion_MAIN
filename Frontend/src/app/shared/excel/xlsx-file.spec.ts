import { buildXlsx, columnName, crc32, sheetName, xmlText, zipStore } from './xlsx-file';

/** Reads a stored (uncompressed) ZIP back through its central directory. */
function unzip(zip: Uint8Array): Map<string, string> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));
    expect(method).toBe(0);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const dataStart =
      local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = zip.subarray(dataStart, dataStart + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, decoder.decode(data));
    at += 46 + nameLength;
  }
  return files;
}

describe('xlsx file', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('names columns like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('escapes text and drops characters XML cannot hold', () => {
    expect(xmlText('Tom & Jerry <"Kids">')).toBe('Tom &amp; Jerry &lt;&quot;Kids&quot;&gt;');
    expect(xmlText('a\u0000b\u0008c\td')).toBe('abc\td');
    expect(xmlText('₹ 1,299 — ok')).toBe('₹ 1,299 — ok');
  });

  it('makes legal sheet names', () => {
    expect(sheetName('Stock [Nov]: 1/2')).toBe('Stock  Nov   1 2');
    expect(sheetName('x'.repeat(40))).toHaveLength(31);
    expect(sheetName(' ? ')).toBe('Sheet1');
  });

  it('writes a ZIP that reads back byte for byte', () => {
    const zip = zipStore([
      ['a.txt', 'hello'],
      ['dir/b.xml', '<x>₹</x>'],
    ]);
    const files = unzip(zip);
    expect([...files.keys()]).toEqual(['a.txt', 'dir/b.xml']);
    expect(files.get('dir/b.xml')).toBe('<x>₹</x>');
  });

  it('builds a workbook with text, styled numbers, a frozen heading and a filter', () => {
    const files = unzip(
      buildXlsx({
        name: 'Stock',
        widths: [20, 10, 12],
        rows: [
          [{ value: 'Stock Report', style: 'title' }],
          [],
          [
            { value: 'Item', style: 'head' },
            { value: 'Qty', style: 'headEnd' },
            { value: 'Value', style: 'headEnd' },
          ],
          ['Shirt & Tie', { value: 12, style: 'qty' }, { value: 8640.5, style: 'money' }],
          ['Fabric', { value: 2.75, style: 'qty' }, null],
          [
            { value: 'Total', style: 'totalText' },
            { value: 14.75, style: 'totalQty' },
            { value: 8640.5, style: 'totalMoney' },
          ],
        ],
        headRow: 2,
        filterRows: 2,
      }),
    );
    expect([...files.keys()]).toContain('[Content_Types].xml');
    expect(files.get('xl/styles.xml')).toContain('<cellXfs count="13">');

    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="2"><is><t>Stock Report</t></is></c>');
    expect(sheet).not.toContain('<row r="2">');
    expect(sheet).toContain('<c r="A4" t="inlineStr"><is><t>Shirt &amp; Tie</t></is></c>');
    expect(sheet).toContain('<c r="B4" s="6"><v>12</v></c>'); // whole number: #,##0
    expect(sheet).toContain('<c r="B5" s="7"><v>2.75</v></c>'); // decimals: #,##0.###
    expect(sheet).toContain('<c r="C4" s="8"><v>8640.5</v></c>'); // money: #,##0.00
    expect(sheet).toContain('<c r="B6" s="11"><v>14.75</v></c>');
    expect(sheet).not.toContain('r="C5"');
    expect(sheet).toContain(
      '<pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/>',
    );
    expect(sheet).toContain('<autoFilter ref="A3:C5"/>');
    expect(sheet).toContain('<col min="1" max="1" width="20" customWidth="1"/>');

    const workbook = files.get('xl/workbook.xml')!;
    expect(workbook).toContain('<sheet name="Stock" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain(`'Stock'!$A$3:$C$5`);
    expect(workbook).toContain(`'Stock'!$3:$3`);
  });
});
