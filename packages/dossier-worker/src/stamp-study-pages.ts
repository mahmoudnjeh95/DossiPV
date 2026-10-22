import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { drawPdfText, fitPdfText } from './pdf-text';
import { embedLogo } from './render-cover-page';

export interface StampStudyPagesOptions {
  /** Pages 1..studyPageCount are the study (cover + TOC + body); later pages are annexes. */
  studyPageCount: number;
  /** The installer's logo; null prints the installer's name instead. */
  logo: Buffer | null;
  /** The official STEG logo (`tryLoadStegLogo()`); null leaves its place empty. */
  stegLogo: Buffer | null;
  installerName: string;
  /** The installer's own number (e.g. `434 - 303`); null prints no number. */
  dossierNumber: string | null;
  /**
   * Pages inserted right after the cover once the study is stamped (a draft's missing-pieces
   * page, `DRAFT_INSERTED_PAGE_COUNT`). Every footer moves by this much, so « Page n sur N »
   * matches the page the reader is on and the TOC's numbers. Default 0.
   */
  pagesInsertedAfterCover?: number;
}

const BLACK = rgb(0, 0, 0);
/** Double-line frame, as on the cover: outer 1 pt at a 20 pt inset, inner 0.5 pt at 24 pt. */
const FRAME_LINES = [
  { inset: 20, borderWidth: 1 },
  { inset: 24, borderWidth: 0.5 },
] as const;
/** Header and footer content sits this far inside the page edge (10 pt inside the inner frame). */
const CONTENT_INSET = 34;
const HEADER_TOP_INSET = 30;
const LOGO_MAX = { width: 60, height: 30 };
const HEADER_TEXT_SIZE = 10;
const FOOTER_TEXT_SIZE = 10;
const FOOTER_BASELINE_INSET = 32;

/** The cover's double frame, drawn on `page`'s media box. */
export function drawPageFrame(page: PDFPage): void {
  const box = page.getMediaBox();
  for (const { inset, borderWidth } of FRAME_LINES) {
    page.drawRectangle({
      x: box.x + inset,
      y: box.y + inset,
      width: box.width - 2 * inset,
      height: box.height - 2 * inset,
      borderColor: BLACK,
      borderWidth,
    });
  }
}

/** `image` scaled into the 60 × 30 pt header box, its top at the header line. Returns its x span. */
function drawHeaderLogo(page: PDFPage, image: PDFImage, align: 'left' | 'right'): { left: number; right: number } {
  const box = page.getMediaBox();
  const scale = Math.min(LOGO_MAX.width / image.width, LOGO_MAX.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = align === 'left' ? box.x + CONTENT_INSET : box.x + box.width - CONTENT_INSET - width;
  page.drawImage(image, { x, y: box.y + box.height - HEADER_TOP_INSET - height, width, height });
  return { left: x, right: x + width };
}

export interface HeaderParts {
  logo: PDFImage | null;
  stegLogo: PDFImage | null;
  installerName: string;
  dossierNumberText: string | null;
}

/** Installer logo (or name) on the left; « Dossier n° … » then the STEG logo on the right. */
export function drawHeader(page: PDFPage, parts: HeaderParts, fonts: { regular: PDFFont; bold: PDFFont }): void {
  const box = page.getMediaBox();
  // Text lines up with the middle of the logo box.
  const textBaseline = box.y + box.height - HEADER_TOP_INSET - LOGO_MAX.height / 2 - HEADER_TEXT_SIZE * 0.35;

  let rightEdge = box.x + box.width - CONTENT_INSET;
  if (parts.stegLogo) rightEdge = drawHeaderLogo(page, parts.stegLogo, 'right').left - 8;
  let numberLeft = rightEdge;
  if (parts.dossierNumberText) {
    const width = fonts.bold.widthOfTextAtSize(parts.dossierNumberText, HEADER_TEXT_SIZE);
    numberLeft = rightEdge - width;
    drawPdfText(page, parts.dossierNumberText, { x: numberLeft, y: textBaseline, size: HEADER_TEXT_SIZE, font: fonts.bold, color: BLACK });
  }

  if (parts.logo) {
    drawHeaderLogo(page, parts.logo, 'left');
    return;
  }
  const left = box.x + CONTENT_INSET;
  const maxWidth = Math.max(40, numberLeft - 12 - left);
  const fitted = fitPdfText(fonts.bold, parts.installerName, { size: HEADER_TEXT_SIZE, minSize: 7, maxWidth, maxHeight: HEADER_TEXT_SIZE * 1.2 });
  if (fitted.lines[0]) {
    page.drawText(fitted.lines[0], { x: left, y: textBaseline, size: fitted.size, font: fonts.bold, color: BLACK });
  }
}

/** « Page n sur N », right-aligned above the bottom frame. */
function drawFooter(page: PDFPage, text: string, font: PDFFont): void {
  const box = page.getMediaBox();
  const width = font.widthOfTextAtSize(text, FOOTER_TEXT_SIZE);
  page.drawText(text, { x: box.x + box.width - CONTENT_INSET - width, y: box.y + FOOTER_BASELINE_INSET, size: FOOTER_TEXT_SIZE, font, color: BLACK });
}

/**
 * Stamps the study pages of the merged dossier like the reference: the double frame on pages
 * 1..studyPageCount; on pages 2..studyPageCount the running header (installer logo or name,
 * « Dossier n° … » and the STEG logo) and the footer « Page n sur N ». The cover (page 1) draws
 * its own logos, and the annexes (drawings and plans carry their own cartouche) are left as they are.
 */
export async function stampStudyPages(pdf: Buffer, options: StampStudyPagesOptions): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  const studyPages = pages.slice(0, Math.max(0, Math.min(options.studyPageCount, pages.length)));
  if (studyPages.length === 0) return pdf;

  const fonts = { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) };
  const parts: HeaderParts = {
    logo: await embedLogo(doc, options.logo),
    stegLogo: await embedLogo(doc, options.stegLogo),
    installerName: options.installerName,
    dossierNumberText: options.dossierNumber?.trim() ? `Dossier n° ${options.dossierNumber.trim()}` : null,
  };
  const shift = options.pagesInsertedAfterCover ?? 0;
  const total = options.studyPageCount + shift;

  studyPages.forEach((page, index) => {
    drawPageFrame(page);
    if (index === 0) return;
    drawHeader(page, parts, fonts);
    drawFooter(page, `Page ${index + 1 + shift} sur ${total}`, fonts.regular);
  });
  return Buffer.from(await doc.save());
}
