import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface CoverPageInput {
  companyName: string;
  companyLogoBuffer: Buffer | null;
  dossierNumber: string | null;
  clientFullName: string;
  dossierDate: string;
}

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;

export async function renderCoverPage(input: CoverPageInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  if (input.companyLogoBuffer) {
    // pdf-lib's embedPng/embedJpg each throw on the wrong format — callers must have already
    // validated the stored mimeType; try PNG first, fall back to JPEG.
    let image;
    try {
      image = await doc.embedPng(input.companyLogoBuffer);
    } catch {
      image = await doc.embedJpg(input.companyLogoBuffer);
    }
    const logoWidth = 120;
    const logoHeight = (image.height / image.width) * logoWidth;
    page.drawImage(image, {
      x: (PAGE_WIDTH - logoWidth) / 2,
      y: PAGE_HEIGHT - 150,
      width: logoWidth,
      height: logoHeight,
    });
  }

  page.drawText(input.companyName, {
    x: 50,
    y: PAGE_HEIGHT - 220,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });

  page.drawText('Dossier Technique', {
    x: 50,
    y: PAGE_HEIGHT - 420,
    size: 28,
    font,
    color: rgb(0, 0, 0),
  });

  if (input.dossierNumber) {
    page.drawText(`N° Dossier : ${input.dossierNumber}`, {
      x: 50,
      y: PAGE_HEIGHT - 460,
      size: 14,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
  }

  page.drawText(`Client : ${input.clientFullName}`, {
    x: 50,
    y: PAGE_HEIGHT - 490,
    size: 14,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  page.drawText(`Date : ${input.dossierDate}`, {
    x: 50,
    y: PAGE_HEIGHT - 520,
    size: 14,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  return Buffer.from(await doc.save());
}
