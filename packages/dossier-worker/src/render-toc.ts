import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { drawPdfText, toPdfSafeText } from './pdf-text';
import { extractTextBoxes, type TextBox } from './pdf-locate';

export interface TocEntry {
  title: string;
  pageNumber: number;
  /** 2 indents the entry under its section; default 1. */
  level?: 1 | 2;
}


const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEVEL_2_INDENT = 16;
const TEXT_X = 50;
const PAGE_NUMBER_X = PAGE_WIDTH - 80;
const TEXT_SIZE = 11;
const ROW_HEIGHT = 20;
// stampStudyPages draws the running header in the top 60 pt and the footer near the bottom, so
// the content starts 3 cm down, like the Word body's top margin.
const CONTENT_TOP = 85;
const TITLE_SIZE = 20;
const TOP_MARGIN = CONTENT_TOP + TITLE_SIZE + 35;
const BOTTOM_MARGIN = 60;

export async function renderTableOfContents(entries: TocEntry[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const titleFont = await doc.embedFont(StandardFonts.TimesRomanBold);

  const rowsPerPage = Math.floor((PAGE_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN) / ROW_HEIGHT);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPdfText(page, 'Table des matières', { x: 50, y: PAGE_HEIGHT - CONTENT_TOP - TITLE_SIZE, size: TITLE_SIZE, font: titleFont, color: rgb(0, 0, 0) });
  let y = PAGE_HEIGHT - TOP_MARGIN;
  let rowOnPage = 0;

  for (const entry of entries) {
    if (rowOnPage >= rowsPerPage) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - CONTENT_TOP - 11;
      rowOnPage = 0;
    }
    const x = TEXT_X + (entry.level === 2 ? LEVEL_2_INDENT : 0);
    drawPdfText(page, entry.title, { x, y, size: TEXT_SIZE, font, color: rgb(0, 0, 0) });
    const pageText = String(entry.pageNumber);
    page.drawText(pageText, { x: PAGE_NUMBER_X, y, size: TEXT_SIZE, font, color: rgb(0, 0, 0) });
    // Dotted leader from the end of the title to the page number.
    const leaderStart = x + font.widthOfTextAtSize(toPdfSafeText(entry.title), TEXT_SIZE) + 4;
    const leaderEnd = PAGE_NUMBER_X - 4;
    if (leaderEnd > leaderStart) {
      page.drawLine({ start: { x: leaderStart, y: y + 1 }, end: { x: leaderEnd, y: y + 1 }, thickness: 0.6, color: rgb(0.4, 0.4, 0.4), dashArray: [0.6, 2.4] });
    }
    y -= ROW_HEIGHT;
    rowOnPage += 1;
  }

  return Buffer.from(await doc.save());
}

const normalize = (text: string): string => text.replace(/s+/g, ' ').trim();

/** The page's text boxes grouped into lines (same baseline), left to right, whitespace collapsed. */
function pageLines(boxes: TextBox[]): string[] {
  const rows: { y: number; boxes: TextBox[] }[] = [];
  for (const box of boxes) {
    const row = rows.find((r) => Math.abs(r.y - box.y) < 2);
    if (row) row.boxes.push(box);
    else rows.push({ y: box.y, boxes: [box] });
  }
  return rows.map((row) => normalize(row.boxes.sort((a, b) => a.x - b.x).map((b) => b.text).join(' ')));
}

/**
 * The 1-based body page on which each heading is printed. Headings are searched in order, each
 * from the previous heading's page onwards, and matched on the normalized text of a whole line;
 * null when a heading is not found.
 */
export async function findHeadingPages(bodyPdf: Buffer, headings: string[]): Promise<(number | null)[]> {
  const pages = (await extractTextBoxes(bodyPdf)).map(pageLines);
  const found: (number | null)[] = [];
  let fromPage = 0;
  for (const heading of headings) {
    const wanted = normalize(heading);
    let at: number | null = null;
    for (let p = fromPage; p < pages.length && at === null; p += 1) {
      if (pages[p]!.some((line) => line === wanted || line.startsWith(wanted))) at = p;
    }
    found.push(at === null ? null : at + 1);
    if (at !== null) fromPage = at;
  }
  return found;
}
