import { PDFDocument, StandardFonts, rgb, type PDFImage } from 'pdf-lib';
import { drawPdfText } from './pdf-text';

export interface CoverPageInput {
  companyName: string;
  companyLogoBuffer: Buffer | null;
  dossierNumber: string | null;
  clientFullName: string;
  /** ISO date (`YYYY-MM-DD`, or a full ISO timestamp); printed as `dd/MM/yyyy`. */
  dossierDate: string;
}

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;

/**
 * Formats an ISO date as French `dd/MM/yyyy`. The date part is read textually (never through
 * `new Date()`), so the printed day can't shift with the server's time zone. Anything that isn't
 * an ISO date is returned unchanged.
 */
export function formatFrenchDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Embeds a PNG or JPEG logo, or returns null if it's neither. The stored mimeType is already
 * validated as png/jpeg on upload, but a corrupt logo file must never fail the whole dossier —
 * the cover simply renders without it.
 */
export async function embedLogo(doc: PDFDocument, buffer: Buffer | null): Promise<PDFImage | null> {
  if (!buffer) return null;
  try {
    return await doc.embedPng(buffer);
  } catch {
    try {
      return await doc.embedJpg(buffer);
    } catch {
      return null;
    }
  }
}

export async function renderCoverPage(input: CoverPageInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const image = await embedLogo(doc, input.companyLogoBuffer);
  if (image) {
    const maxWidth = 160;
    const maxHeight = 110;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const logoWidth = image.width * scale;
    const logoHeight = image.height * scale;
    page.drawImage(image, {
      x: (PAGE_WIDTH - logoWidth) / 2,
      y: PAGE_HEIGHT - 60 - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
  }

  drawPdfText(page, input.companyName, {
    x: 50,
    y: PAGE_HEIGHT - 220,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });

  drawPdfText(page, 'Dossier Technique', {
    x: 50,
    y: PAGE_HEIGHT - 420,
    size: 28,
    font,
    color: rgb(0, 0, 0),
  });

  if (input.dossierNumber) {
    drawPdfText(page, `N° Dossier : ${input.dossierNumber}`, {
      x: 50,
      y: PAGE_HEIGHT - 460,
      size: 14,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
  }

  drawPdfText(page, `Client : ${input.clientFullName}`, {
    x: 50,
    y: PAGE_HEIGHT - 490,
    size: 14,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  drawPdfText(page, `Date : ${formatFrenchDate(input.dossierDate)}`, {
    x: 50,
    y: PAGE_HEIGHT - 520,
    size: 14,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  return Buffer.from(await doc.save());
}
