/*
 * A small Excel (.xlsx) writer: one worksheet of text and numbers with a few fixed styles
 * (title, heading, quantities, rupees, totals), column widths, a frozen heading row, an auto
 * filter and landscape A4 page setup. An .xlsx file is a ZIP of XML parts; this writes the
 * parts and stores them uncompressed — every spreadsheet program opens it, and no library
 * (SheetJS, ExcelJS…) has to be shipped for it.
 */

/**
 * How a cell looks:
 *   text, bold, title (large bold), muted (grey) — text;
 *   head / headEnd — table heading (left / right aligned);
 *   qty — quantity (whole numbers as 1,234, decimals up to 3 places); money — 1,234.50;
 *   total* — the same, bold with a rule above, for a totals row.
 */
export type XlsxStyle =
  | 'text'
  | 'bold'
  | 'title'
  | 'muted'
  | 'head'
  | 'headEnd'
  | 'qty'
  | 'money'
  | 'totalText'
  | 'totalQty'
  | 'totalMoney';

export interface XlsxCell {
  readonly value: string | number | null;
  readonly style?: XlsxStyle;
}

/** A bare string / number is a plain cell; null leaves the cell empty. */
export type XlsxValue = string | number | null | XlsxCell;

export interface XlsxSheet {
  /** Tab name (at most 31 characters; [ ] : * ? / \ are replaced). */
  readonly name: string;
  /** Column widths in characters, left to right. */
  readonly widths: readonly number[];
  readonly rows: readonly (readonly XlsxValue[])[];
  /**
   * 0-based index of the table's heading row: rows up to it stay in view while scrolling, it
   * repeats on every printed page and gets filter buttons over the rows below it.
   */
  readonly headRow?: number;
  /** Rows after the heading that the filter covers (default: up to the last row). */
  readonly filterRows?: number;
}

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---- Styles ---------------------------------------------------------------------------------------

/** cellXfs index of each style (see STYLES_XML). Quantities with decimals use QTY_DECIMAL. */
const STYLE_INDEX: Readonly<Record<XlsxStyle, number>> = {
  text: 0,
  bold: 1,
  title: 2,
  muted: 3,
  head: 4,
  headEnd: 5,
  qty: 6,
  money: 8,
  totalText: 9,
  totalQty: 10,
  totalMoney: 12,
};
const QTY_DECIMAL: Partial<Record<XlsxStyle, number>> = { qty: 7, totalQty: 11 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.###"/></numFmts>
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE6F2EF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF1F2937"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="13">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// ---- Worksheet -----------------------------------------------------------------------------------

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** 0 → A, 25 → Z, 26 → AA … */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Text as XML character data; characters XML cannot hold at all are dropped. */
export function xmlText(value: string): string {
  return value
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A legal worksheet name: no [ ] : * ? / \, at most 31 characters, not empty. */
export function sheetName(name: string): string {
  const clean = name
    .replace(/[[\]:*?/\\]/g, ' ')
    .replace(/^'+|'+$/g, '')
    .trim()
    .slice(0, 31)
    .trim();
  return clean || 'Sheet1';
}

function cellXml(ref: string, cell: XlsxValue): string {
  const { value, style = 'text' } =
    cell !== null && typeof cell === 'object' ? cell : { value: cell, style: undefined };
  if (value === null || value === '') {
    // An empty cell still carries its style (e.g. the rule above a totals row).
    return style === 'text' ? '' : `<c r="${ref}" s="${STYLE_INDEX[style]}"/>`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const decimal = !Number.isInteger(value) ? QTY_DECIMAL[style] : undefined;
    const index = decimal ?? STYLE_INDEX[style];
    return `<c r="${ref}"${index ? ` s="${index}"` : ''}><v>${value}</v></c>`;
  }
  const index = STYLE_INDEX[style];
  const space = /^\s|\s$|\n/.test(value) ? ' xml:space="preserve"' : '';
  return (
    `<c r="${ref}" t="inlineStr"${index ? ` s="${index}"` : ''}>` +
    `<is><t${space}>${xmlText(value)}</t></is></c>`
  );
}

function sheetXml(sheet: XlsxSheet): string {
  const columnCount = Math.max(sheet.widths.length, ...sheet.rows.map((row) => row.length), 1);
  const lastRow = Math.max(sheet.rows.length, 1);
  const lastColumn = columnName(columnCount - 1);
  const head = sheet.headRow;

  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(`${columnName(c)}${r + 1}`, cell)).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    })
    .join('');
  const cols = sheet.widths
    .map((width, c) => `<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`)
    .join('');
  const pane =
    head !== undefined
      ? `<pane ySplit="${head + 1}" topLeftCell="A${head + 2}" activePane="bottomLeft" state="frozen"/>`
      : '';
  const filter = head !== undefined ? `<autoFilter ref="${filterRange(sheet, columnCount)}"/>` : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${lastColumn}${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>` +
    filter +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>'
  );
}

/** A1-style range of the heading row and the rows it filters, e.g. A5:P42. */
function filterRange(sheet: XlsxSheet, columnCount: number): string {
  const head = sheet.headRow ?? 0;
  const last = sheet.filterRows !== undefined ? head + 1 + sheet.filterRows : sheet.rows.length;
  return `A${head + 1}:${columnName(columnCount - 1)}${Math.max(last, head + 1)}`;
}

function workbookXml(sheet: XlsxSheet): string {
  const name = sheetName(sheet.name);
  const quoted = `'${xmlText(name.replace(/'/g, "''"))}'`;
  const columnCount = Math.max(sheet.widths.length, ...sheet.rows.map((row) => row.length), 1);
  const names =
    sheet.headRow !== undefined
      ? '<definedNames>' +
        `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${quoted}!${absolute(
          filterRange(sheet, columnCount),
        )}</definedName>` +
        `<definedName name="_xlnm.Print_Titles" localSheetId="0">${quoted}!$${sheet.headRow + 1}:$${
          sheet.headRow + 1
        }</definedName>` +
        '</definedNames>'
      : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    '<bookViews><workbookView/></bookViews>' +
    `<sheets><sheet name="${xmlText(name)}" sheetId="1" r:id="rId1"/></sheets>` +
    names +
    '</workbook>'
  );
}

/** A5:P42 → $A$5:$P$42 */
function absolute(range: string): string {
  return range.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>';

const WORKBOOK_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>` +
  '</Relationships>';

/** The .xlsx file's bytes. `now` dates the ZIP entries. */
export function buildXlsx(sheet: XlsxSheet, now = new Date()): Uint8Array {
  return zipStore(
    [
      ['[Content_Types].xml', CONTENT_TYPES_XML],
      ['_rels/.rels', ROOT_RELS_XML],
      ['xl/workbook.xml', workbookXml(sheet)],
      ['xl/_rels/workbook.xml.rels', WORKBOOK_RELS_XML],
      ['xl/styles.xml', STYLES_XML],
      ['xl/worksheets/sheet1.xml', sheetXml(sheet)],
    ],
    now,
  );
}

/** Builds the workbook and saves it as `fileName` (should end in .xlsx). */
export function downloadXlsx(fileName: string, sheet: XlsxSheet): void {
  const bytes = buildXlsx(sheet);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: MIME_XLSX });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---- ZIP (stored, no compression) ----------------------------------------------------------------

let crcTable: Uint32Array | null = null;

/** CRC-32 (IEEE 802.3), as ZIP needs it. */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A ZIP archive of the given files, stored as they are (method 0), names in UTF-8. */
export function zipStore(
  files: readonly (readonly [string, string])[],
  now = new Date(),
): Uint8Array {
  const encoder = new TextEncoder();
  // MS-DOS date and time (2-second steps), local time.
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date =
    ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    // extra length, comment length, disk number, internal / external attributes: 0
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const zip = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    zip.set(part, at);
    at += part.length;
  }
  return zip;
}
