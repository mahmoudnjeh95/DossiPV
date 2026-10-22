import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { drawPdfText } from './pdf-text';

export interface TocEntry {
  title: string;
  pageNumber: number;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
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
    drawPdfText(page, entry.title, { x: 50, y, size: 11, font, color: rgb(0, 0, 0) });
    page.drawText(String(entry.pageNumber), { x: PAGE_WIDTH - 80, y, size: 11, font, color: rgb(0, 0, 0) });
    y -= ROW_HEIGHT;
    rowOnPage += 1;
  }

  return Buffer.from(await doc.save());
}
