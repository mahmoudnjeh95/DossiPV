import { PDFDocument, StandardFonts } from 'pdf-lib';

export const TARGET_MODEL = 'SUN-2.2K-G04P1-EU-AM1';

/** Baseline of the target row on page 2 of `syntheticListPdf()`. */
export const TARGET_ROW_Y = 600;

/**
 * A synthetic accepted-equipment list: three A4 pages of rows `Brand | Model | Power | Validity`.
 * The target model is on page 2 only, at `TARGET_ROW_Y`. With `splitTarget`, its model cell is
 * drawn as two text runs in two fonts, so a text extractor returns it as two items.
 */
export async function syntheticListPdf(options: { splitTarget?: boolean; withTarget?: boolean } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 10;
  for (let p = 0; p < 3; p += 1) {
    const page = doc.addPage([595, 842]);
    page.drawText('Marque', { x: 60, y: 780, size, font: bold });
    page.drawText('Modèle', { x: 160, y: 780, size, font: bold });
    page.drawText('Puissance', { x: 360, y: 780, size, font: bold });
    page.drawText('Validité', { x: 460, y: 780, size, font: bold });
    for (let r = 0; r < 12; r += 1) {
      const y = 750 - r * 25;
      const isTarget = p === 1 && y === TARGET_ROW_Y && options.withTarget !== false;
      page.drawText(isTarget ? 'DEYE' : `ACME${p}${r}`, { x: 60, y, size, font });
      if (isTarget && options.splitTarget) {
        const head = 'SUN-2.2K-';
        page.drawText(head, { x: 160, y, size, font });
        page.drawText('G04P1-EU-AM1', { x: 160 + font.widthOfTextAtSize(head, size), y, size, font: bold });
      } else {
        page.drawText(isTarget ? TARGET_MODEL : `INV-${p}${r}00-X`, { x: 160, y, size, font });
      }
      page.drawText(`${(r + 1) * 1000} W`, { x: 360, y, size, font });
      page.drawText('31/12/2028', { x: 460, y, size, font });
    }
  }
  return Buffer.from(await doc.save());
}
