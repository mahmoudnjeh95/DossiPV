import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface TocEntry {
  title: string;
  pageNumber: number;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const ROW_HEIGHT = 20;
const TOP_MARGIN = 100;
const BOTTOM_MARGIN = 60;

export async function renderTableOfContents(entries: TocEntry[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const rowsPerPage = Math.floor((PAGE_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN) / ROW_HEIGHT);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText('Table des matières', { x: 50, y: PAGE_HEIGHT - 50, size: 20, font: titleFont, color: rgb(0, 0, 0) });
  let y = PAGE_HEIGHT - TOP_MARGIN;
  let rowOnPage = 0;

  for (const entry of entries) {
    if (rowOnPage >= rowsPerPage) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 50;
      rowOnPage = 0;
    }
    page.drawText(entry.title, { x: 50, y, size: 11, font, color: rgb(0, 0, 0) });
    page.drawText(String(entry.pageNumber), { x: PAGE_WIDTH - 80, y, size: 11, font, color: rgb(0, 0, 0) });
    y -= ROW_HEIGHT;
    rowOnPage += 1;
  }

  return Buffer.from(await doc.save());
}
