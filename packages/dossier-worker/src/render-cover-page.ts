import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { drawPdfText, wrapPdfText } from './pdf-text';
import { anmeCategoryLabel, type InstallerIdentity } from './installer-identity';

export interface CoverPageInput {
  installer: InstallerIdentity;
  companyLogoBuffer: Buffer | null;
  /** The official STEG logo (`tryLoadStegLogo()`); null leaves the top-right corner empty. */
  stegLogoBuffer: Buffer | null;
  /** The installer's own number (e.g. `434 - 303`); null only for a legacy snapshot. */
  dossierNumber: string | null;
  /** ISO date (`YYYY-MM-DD`, or a full ISO timestamp); printed as `dd/MM/yyyy`. */
  dossierDate: string;
  client: { fullName: string; cin: string | null; address: string | null; stegReference: string | null };
  gps: { lat: number; lon: number } | null;
  installedKWp: number;
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
  // Standalone copy: pdf-lib ignores a pooled Buffer's byteOffset (see embedImageSafely).
  const bytes = Uint8Array.from(buffer);
  try {
    return await doc.embedPng(bytes);
  } catch {
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

const LABEL_BLUE = rgb(0.12, 0.31, 0.6);
const BLACK = rgb(0, 0, 0);
const TITLE = "Dossier technique d'une installation photovoltaïque raccordée au réseau Basse Tension de la STEG";
const MARGIN_X = 70;
const LOGO_BOX = { width: 150, height: 80, top: PAGE_HEIGHT - 45 };

/** Draws `image` scaled into the logo box, its left edge at `x` (or its right edge at `-x`). */
function drawLogo(page: PDFPage, image: PDFImage, align: 'left' | 'right'): void {
  const scale = Math.min(LOGO_BOX.width / image.width, LOGO_BOX.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = align === 'left' ? 45 : PAGE_WIDTH - 45 - width;
  page.drawImage(image, { x, y: LOGO_BOX.top - height, width, height });
}

/** `label value`, the label in the reference blue; a long value wraps under itself. Returns the next y. */
function drawField(page: PDFPage, font: PDFFont, label: string, value: string, y: number): number {
  const size = 11;
  const labelText = `${label} :`;
  drawPdfText(page, labelText, { x: MARGIN_X, y, size, font, color: LABEL_BLUE });
  const valueX = MARGIN_X + font.widthOfTextAtSize(labelText, size) + 4;
  const valueLines = wrapPdfText(font, value, size, PAGE_WIDTH - 50 - valueX);
  valueLines.forEach((line, i) => {
    page.drawText(line, { x: valueX, y: y - i * 14, size, font, color: BLACK });
  });
  return y - Math.max(1, valueLines.length) * 14 - 10;
}

function formatKWp(kWp: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(kWp);
}

/**
 * The dossier cover, laid out like the reference dossier's page 1: a double frame, the
 * installer's logo top-left and the STEG logo top-right, the centred title, then the labelled
 * client, site and installer fields.
 */
export async function renderCoverPage(input: CoverPageInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

  // Double-line page frame: outer 1 pt at a 20 pt inset, inner 0.5 pt at 24 pt.
  for (const [inset, borderWidth] of [[20, 1], [24, 0.5]] as const) {
    page.drawRectangle({ x: inset, y: inset, width: PAGE_WIDTH - 2 * inset, height: PAGE_HEIGHT - 2 * inset, borderColor: BLACK, borderWidth });
  }

  const companyLogo = await embedLogo(doc, input.companyLogoBuffer);
  if (companyLogo) drawLogo(page, companyLogo, 'left');
  const stegLogo = await embedLogo(doc, input.stegLogoBuffer);
  if (stegLogo) drawLogo(page, stegLogo, 'right');

  const titleSize = 18;
  const titleLines = wrapPdfText(bold, TITLE, titleSize, PAGE_WIDTH - 2 * 90);
  titleLines.forEach((line, i) => {
    const width = bold.widthOfTextAtSize(line, titleSize);
    page.drawText(line, { x: (PAGE_WIDTH - width) / 2, y: PAGE_HEIGHT - 320 - i * 24, size: titleSize, font: bold, color: BLACK });
  });

  const { installer, client, gps } = input;
  const fields: [string, string][] = [
    ['Client BT', client.fullName],
    ['CIN', client.cin?.trim() || 'copie jointe en annexe N°1'],
    ['Référence STEG', client.stegReference?.trim() || '—'],
    ['Adresse', client.address?.trim() || '—'],
    ['Localisation (GPS)', gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : '—'],
    ['Puissance installée', `${formatKWp(input.installedKWp)} kWc`],
    ['Installateur', installer.name],
    ['Agrément ANME n°', `${installer.anmeCode} (catégorie ${anmeCategoryLabel(installer.anmeCategory)}), valable jusqu'au ${formatFrenchDate(installer.anmeValidTo)}`],
    ['N° dossier', input.dossierNumber?.trim() || '—'],
    ['Date', formatFrenchDate(input.dossierDate)],
  ];
  let y = PAGE_HEIGHT - 320 - titleLines.length * 24 - 70;
  for (const [label, value] of fields) {
    y = drawField(page, bold, label, value, y);
  }

  return Buffer.from(await doc.save());
}
