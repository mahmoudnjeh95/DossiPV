import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawPdfText, fitPdfText } from './pdf-text';

export interface AnnexDividerEntry {
  number: number;
  title: string;
  /** Page the annex starts on in the final PDF; null when the project has nothing to annex there. */
  pageNumber: number | null;
  /** Shown in brackets after the title when pageNumber is null; « sans objet » by default. */
  note?: string;
}

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 26;
const TABLE_TOP = PAGE_HEIGHT - 110;
const TABLE_BOTTOM = 60;
const NUMBER_WIDTH = 60;
const PAGE_COLUMN_WIDTH = 70;
const PIECE_WIDTH = PAGE_WIDTH - 2 * MARGIN - NUMBER_WIDTH - PAGE_COLUMN_WIDTH;
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.45, 0.45, 0.45);
const HEADER_FILL = rgb(0.9, 0.9, 0.9);
const LINE = rgb(0.55, 0.55, 0.55);
const EM_DASH = String.fromCodePoint(0x2014);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function drawCentered(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = BLACK): void {
  const width = font.widthOfTextAtSize(text, size);
  drawPdfText(page, text, { x: (PAGE_WIDTH - width) / 2, y, size, font, color });
}

function drawCellText(page: PDFPage, text: string, x: number, width: number, rowTop: number, font: PDFFont, color = BLACK, align: 'left' | 'center' = 'left'): void {
  const { lines, size } = fitPdfText(font, text, { size: 10.5, minSize: 7, maxWidth: width - 12, maxHeight: ROW_HEIGHT - 6 });
  const line = lines[0] ?? '';
  const lineWidth = font.widthOfTextAtSize(line, size);
  const textX = align === 'center' ? x + (width - lineWidth) / 2 : x + 6;
  page.drawText(line, { x: textX, y: rowTop - ROW_HEIGHT / 2 - size / 3, size, font, color });
}

function drawHeader(page: PDFPage, top: number, fonts: Fonts): void {
  const width = PAGE_WIDTH - 2 * MARGIN;
  page.drawRectangle({ x: MARGIN, y: top - HEADER_HEIGHT, width, height: HEADER_HEIGHT, color: HEADER_FILL, borderColor: LINE, borderWidth: 0.8 });
  const baseline = top - HEADER_HEIGHT / 2 - 4;
  const columns: [string, number, number][] = [
    ['N°', MARGIN, NUMBER_WIDTH],
    ['Pièce', MARGIN + NUMBER_WIDTH, PIECE_WIDTH],
    ['Page', MARGIN + NUMBER_WIDTH + PIECE_WIDTH, PAGE_COLUMN_WIDTH],
  ];
  for (const [label, x, columnWidth] of columns) {
    const labelWidth = fonts.bold.widthOfTextAtSize(label, 11);
    drawPdfText(page, label, { x: label === 'Pièce' ? x + 6 : x + (columnWidth - labelWidth) / 2, y: baseline, size: 11, font: fonts.bold, color: BLACK });
  }
}

function drawRow(page: PDFPage, rowTop: number, entry: AnnexDividerEntry, fonts: Fonts): void {
  const width = PAGE_WIDTH - 2 * MARGIN;
  page.drawRectangle({ x: MARGIN, y: rowTop - ROW_HEIGHT, width, height: ROW_HEIGHT, borderColor: LINE, borderWidth: 0.5 });
  for (const x of [MARGIN + NUMBER_WIDTH, MARGIN + NUMBER_WIDTH + PIECE_WIDTH]) {
    page.drawLine({ start: { x, y: rowTop }, end: { x, y: rowTop - ROW_HEIGHT }, thickness: 0.5, color: LINE });
  }
  const empty = entry.pageNumber === null;
  const color = empty ? GREY : BLACK;
  drawCellText(page, String(entry.number), MARGIN, NUMBER_WIDTH, rowTop, fonts.bold, color, 'center');
  drawCellText(page, empty ? `${entry.title} (${entry.note ?? 'sans objet'})` : entry.title, MARGIN + NUMBER_WIDTH, PIECE_WIDTH, rowTop, fonts.regular, color);
  drawCellText(page, empty ? EM_DASH : String(entry.pageNumber), MARGIN + NUMBER_WIDTH + PIECE_WIDTH, PAGE_COLUMN_WIDTH, rowTop, fonts.regular, color, 'center');
}

/**
 * The annexes' divider: a title page with a large « ANNEXES », then the « Bordereau des
 * annexes » table N° | Pièce | Page, one row per annex in number order. An annex the project has
 * nothing for shows « — » as its page and « (sans objet) » (or its `note`) after its title.
 */
export async function renderAnnexDivider(entries: AnnexDividerEntry[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };

  const titlePage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawCentered(titlePage, 'ANNEXES', PAGE_HEIGHT / 2, 54, fonts.bold);
  const ruleWidth = 220;
  titlePage.drawLine({
    start: { x: (PAGE_WIDTH - ruleWidth) / 2, y: PAGE_HEIGHT / 2 - 22 },
    end: { x: (PAGE_WIDTH + ruleWidth) / 2, y: PAGE_HEIGHT / 2 - 22 },
    thickness: 1.5,
    color: BLACK,
  });

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page, 'Bordereau des annexes', { x: MARGIN, y: PAGE_HEIGHT - 70, size: 20, font: fonts.bold, color: BLACK });
  drawHeader(page, TABLE_TOP, fonts);
  let rowTop = TABLE_TOP - HEADER_HEIGHT;
  for (const entry of entries) {
    if (rowTop - ROW_HEIGHT < TABLE_BOTTOM) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawHeader(page, PAGE_HEIGHT - 60, fonts);
      rowTop = PAGE_HEIGHT - 60 - HEADER_HEIGHT;
    }
    drawRow(page, rowTop, entry, fonts);
    rowTop -= ROW_HEIGHT;
  }

  return Buffer.from(await doc.save());
}
