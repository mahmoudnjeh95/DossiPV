import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawPdfText, wrapPdfText } from './pdf-text';

export const DRAFT_WATERMARK_TEXT = 'BROUILLON – NON RECEVABLE';
export const MISSING_PIECES_TITLE = "Pièces manquantes — dossier non recevable en l'état";

const WATERMARK_SIZE = 60;
const WATERMARK_ANGLE_DEG = 45;
const WATERMARK_OPACITY = 0.25;
const RED = rgb(1, 0, 0);
const BLACK = rgb(0, 0, 0);
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const BODY_SIZE = 11;
const LINE_GAP = 4;

/**
 * The two lines of the mark. At 60 pt the text on one line is about 940 pt long: at 45° it would
 * spill over both edges of an A4 page, so it is drawn as two centred lines.
 */
export const DRAFT_WATERMARK_LINES = ['BROUILLON –', 'NON RECEVABLE'] as const;

/** The draft mark across the page, centred on its media box. */
function drawWatermark(page: PDFPage, font: PDFFont): void {
  const box = page.getMediaBox();
  const capHeight = font.heightAtSize(WATERMARK_SIZE, { descender: false });
  const lineHeight = WATERMARK_SIZE * 1.1;
  const angle = (WATERMARK_ANGLE_DEG * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  DRAFT_WATERMARK_LINES.forEach((line, i) => {
    const width = font.widthOfTextAtSize(line, WATERMARK_SIZE);
    // Distance of this line's middle from the block's middle, across the text (first line above).
    const across = ((DRAFT_WATERMARK_LINES.length - 1) / 2 - i) * lineHeight - capHeight / 2;
    // pdf-lib rotates the text about its origin: step back half the line along the baseline
    // (direction (cos, sin)) and move `across` along the perpendicular (-sin, cos).
    page.drawText(line, {
      x: centreX - (width / 2) * cos - across * sin,
      y: centreY - (width / 2) * sin + across * cos,
      size: WATERMARK_SIZE,
      font,
      color: RED,
      opacity: WATERMARK_OPACITY,
      rotate: degrees(WATERMARK_ANGLE_DEG),
    });
  });
}

/** The page that tells the reviewer, and the installer, what the dossier still lacks. */
function drawMissingPiecesPage(page: PDFPage, missing: string[], regular: PDFFont, bold: PDFFont): void {
  const maxWidth = A4[0] - 2 * MARGIN;
  let y = A4[1] - MARGIN - 16;
  for (const line of wrapPdfText(bold, MISSING_PIECES_TITLE, 16, maxWidth)) {
    drawPdfText(page, line, { x: MARGIN, y, size: 16, font: bold, color: BLACK });
    y -= 16 + LINE_GAP;
  }
  y -= 12;
  const intro = 'Ce dossier est un brouillon : les pièces suivantes doivent être jointes avant son dépôt à la STEG.';
  for (const line of wrapPdfText(regular, intro, BODY_SIZE, maxWidth)) {
    drawPdfText(page, line, { x: MARGIN, y, size: BODY_SIZE, font: regular, color: BLACK });
    y -= BODY_SIZE + LINE_GAP;
  }
  y -= 8;
  for (const piece of missing) {
    const lines = wrapPdfText(regular, piece, BODY_SIZE, maxWidth - 16);
    lines.forEach((line, i) => {
      if (i === 0) drawPdfText(page, '•', { x: MARGIN, y, size: BODY_SIZE, font: regular, color: BLACK });
      drawPdfText(page, line, { x: MARGIN + 16, y, size: BODY_SIZE, font: regular, color: BLACK });
      y -= BODY_SIZE + LINE_GAP;
    });
    y -= 2;
  }
}

/**
 * Marks a dossier as a draft: inserts, after the cover, a page listing the missing STEG pieces,
 * then draws « BROUILLON – NON RECEVABLE » diagonally across every page (60 pt, 45°, red, 25 %).
 */
export async function applyDraftWatermark(pdf: Buffer, missing: string[]): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const listPage = doc.insertPage(Math.min(1, doc.getPageCount()), A4);
  drawMissingPiecesPage(listPage, missing, regular, bold);

  for (const page of doc.getPages()) {
    drawWatermark(page, bold);
  }
  return Buffer.from(await doc.save());
}
