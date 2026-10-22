import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

/** The three model columns of the synthetic inverter datasheet, left to right. */
export const INVERTER_MODELS = ['SUN-3K-G04', 'SUN-5K-G04', 'SUN-6K-G04'] as const;
const COLUMN_X = [250, 350, 450];
const HEADER_Y = 700;
const SIZE = 9;

/** Eight labelled rows, worded as on real datasheets; the first six are the values the dossier uses. */
export const INVERTER_ROWS: { label: string; values: [string, string, string] }[] = [
  { label: 'Max. PV Input Voltage (V)', values: ['550', '550', '600'] },
  { label: 'MPPT Voltage Range (V)', values: ['70-500', '70-500', '90-550'] },
  { label: 'Max. Operating PV Input Current (A)', values: ['13', '13', '26'] },
  { label: 'Max. Input Short Circuit Current (A)', values: ['17', '17', '34'] },
  { label: 'Rated AC Output Active Power (W)', values: ['3000', '5000', '6000'] },
  { label: 'Max. AC Output Current (A)', values: ['13.6', '22.7', '27.3'] },
  { label: 'Weight (kg)', values: ['12', '12', '14'] },
  { label: 'AC Output Short Circuit Protection', values: ['Yes', 'Yes', 'Yes'] },
];

export function inverterRowY(row: number): number {
  return 680 - 18 * row;
}

/** Rows (from the top) whose single value is centred across the whole table in the `stacked` layout. */
export const MERGED_ROWS = 4;

/** Centre of those merged cells: the middle of the three columns. */
export const MERGED_CELL_X = 350;

async function newPage(): Promise<{ doc: PDFDocument; page: PDFPage; font: PDFFont; bold: PDFFont }> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  return { doc, page, font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

function drawCentred(page: PDFPage, font: PDFFont, text: string, centreX: number, y: number, size = SIZE): void {
  page.drawText(text, { x: centreX - font.widthOfTextAtSize(text, size) / 2, y, size, font });
}

/**
 * A synthetic inverter datasheet page, after the real ones:
 * - `columns`: a « Model » header line with three model columns, every row filled per column;
 * - `single`: one model per sheet, its name as the page title, one value column;
 * - `stacked`: each model header printed on two lines (`SUN-3K-G04` / `P1-EU`, as DEYE does), the
 *   first `MERGED_ROWS` rows holding one value centred across the table (a merged cell).
 */
export async function syntheticInverterDatasheet(layout: 'columns' | 'single' | 'stacked'): Promise<Buffer> {
  const { doc, page, font, bold } = await newPage();
  page.drawText('Technical Data', { x: 50, y: 780, size: 14, font: bold });
  if (layout === 'single') {
    page.drawText(INVERTER_MODELS[1], { x: 50, y: 750, size: 16, font: bold });
    for (const [r, row] of INVERTER_ROWS.entries()) {
      page.drawText(row.label, { x: 50, y: inverterRowY(r), size: SIZE, font });
      page.drawText(row.values[1], { x: 300, y: inverterRowY(r), size: SIZE, font });
    }
    return Buffer.from(await doc.save());
  }

  page.drawText('Model', { x: 50, y: HEADER_Y, size: SIZE, font: bold });
  for (const [c, model] of INVERTER_MODELS.entries()) {
    if (layout === 'stacked') {
      drawCentred(page, bold, model, COLUMN_X[c]!, HEADER_Y + 7);
      drawCentred(page, bold, 'P1-EU', COLUMN_X[c]!, HEADER_Y);
    } else {
      drawCentred(page, bold, model, COLUMN_X[c]!, HEADER_Y);
    }
  }
  for (const [r, row] of INVERTER_ROWS.entries()) {
    page.drawText(row.label, { x: 50, y: inverterRowY(r), size: SIZE, font });
    if (layout === 'stacked' && r < MERGED_ROWS) {
      // A merged cell over the three columns, its text centred on the table.
      drawCentred(page, font, row.values[0], MERGED_CELL_X, inverterRowY(r));
      continue;
    }
    for (const [c, value] of row.values.entries()) drawCentred(page, font, value, COLUMN_X[c]!, inverterRowY(r));
  }
  if (layout === 'stacked') {
    // A section bar with a lone mark over the last column only: no merged cell over the others.
    page.drawText('AC Output Side', { x: 50, y: inverterRowY(INVERTER_ROWS.length), size: SIZE, font: bold });
    drawCentred(page, font, '3', COLUMN_X[2]!, inverterRowY(INVERTER_ROWS.length));
  }
  return Buffer.from(await doc.save());
}

/** The used values of the synthetic module, its column headed by its power (no model printed). */
export const SYNTHETIC_MODULE = { model: 'AE450MC-144', pmaxW: 450, vocV: 50, iscA: 11.54, vmpV: 41.4, impA: 10.87 };
export const MODULE_POWERS = ['440', '445', '450'] as const;
const MODULE_COLUMN_X = [180, 240, 300];

/**
 * A synthetic module datasheet: the STC table's first row (« Nominal max. power (Wp) ») heads
 * the power classes; the 450 W column prints its values with a comma or a dot. The 445 W column
 * holds a decoy equal to the 450 W module's Imp.
 */
export async function syntheticModuleDatasheet(): Promise<Buffer> {
  const { doc, page, font, bold } = await newPage();
  page.drawText('AE MC-144 430W-450W', { x: 40, y: 780, size: 16, font: bold });
  const rows: [string, [string, string, string]][] = [
    ['Nominal max. power (Wp)', [...MODULE_POWERS]],
    ['Maximum operating voltage (V)', ['41.00', '41.20', '41,40']],
    ['Maximum operating current (A)', ['10.74', '10.87', '10.87']],
    ['Open-circuit voltage (V)', ['49.60', '49.80', '50.00']],
    ['Short-circuit current (A)', ['11.33', '11.46', '11.54']],
    ['Module efficiency (%)', ['20.24', '20.47', '20.70']],
  ];
  for (const [r, [label, values]] of rows.entries()) {
    const y = 500 - 18 * r;
    page.drawText(label, { x: 40, y, size: SIZE, font });
    for (const [c, value] of values.entries()) drawCentred(page, font, value, MODULE_COLUMN_X[c]!, y);
  }
  return Buffer.from(await doc.save());
}

/** A 1×1 PNG. */
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** A scanned datasheet: one page holding only an image, no text layer. */
export async function imageOnlyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawImage(await doc.embedPng(PIXEL_PNG), { x: 50, y: 50, width: 495, height: 742 });
  return Buffer.from(await doc.save());
}
