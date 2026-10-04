import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface DrawingsInput {
  moduleLabel: string;
  inverters: { inverterLabel: string; pacW: number; mppts: { stringsInParallel: number; modulesPerString: number }[] }[];
  dcSwitchLabel: string;
  dcSpdLabel: string;
  acSpdLabel: string;
  acBreakerLabel: string;
  dcRun: { sectionMm2: number; lengthM: number };
  acRun: { sectionMm2: number; lengthM: number };
  earthRodCount: number;
}

const PAGE_WIDTH = 841.89; // A4 landscape, points — wider pages suit a left-to-right diagram
const PAGE_HEIGHT = 595.28;

function drawBox(page: import('pdf-lib').PDFPage, x: number, y: number, w: number, h: number, label: string, font: import('pdf-lib').PDFFont): void {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  page.drawText(label, { x: x + 4, y: y + h / 2 - 5, size: 8, font, color: rgb(0, 0, 0), maxWidth: w - 8 });
}

function drawSingleLine(doc: PDFDocument, input: DrawingsInput, font: import('pdf-lib').PDFFont): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText('Schéma unifilaire simplifié', { x: 40, y: PAGE_HEIGHT - 40, size: 16, font, color: rgb(0, 0, 0) });

  const boxY = PAGE_HEIGHT / 2;
  const boxH = 40;
  const slotWidth = (PAGE_WIDTH - 80) / (input.inverters.length + 2);

  const moduleCount = input.inverters.reduce(
    (sum, inv) => sum + inv.mppts.reduce((s, m) => s + m.stringsInParallel * m.modulesPerString, 0),
    0,
  );
  drawBox(page, 40, boxY, slotWidth, boxH, `${moduleCount} x ${input.moduleLabel}`, font);

  input.inverters.forEach((inv, i) => {
    const x = 40 + slotWidth * (i + 1);
    drawBox(page, x, boxY, slotWidth, boxH, inv.inverterLabel, font);
  });

  const meterX = 40 + slotWidth * (input.inverters.length + 1);
  drawBox(page, meterX, boxY, slotWidth, boxH, 'Point d\'injection STEG', font);
}

function drawUnifilar(doc: PDFDocument, input: DrawingsInput, font: import('pdf-lib').PDFFont): void {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText('Schéma de câblage détaillé', { x: 40, y: PAGE_HEIGHT - 40, size: 16, font, color: rgb(0, 0, 0) });

  const rowY = PAGE_HEIGHT - 120;
  const boxH = 36;
  const slots = ['Champ PV', ...input.inverters.map(() => 'Onduleur'), input.dcSwitchLabel, input.dcSpdLabel, input.acBreakerLabel, input.acSpdLabel, 'Compteur STEG'];
  const slotWidth = (PAGE_WIDTH - 80) / slots.length;

  slots.forEach((label, i) => {
    const x = 40 + slotWidth * i;
    drawBox(page, x, rowY, slotWidth - 10, boxH, label, font);
    if (i > 0) {
      page.drawLine({
        start: { x: 40 + slotWidth * i - 10, y: rowY + boxH / 2 },
        end: { x: 40 + slotWidth * i, y: rowY + boxH / 2 },
        thickness: 1,
        color: rgb(0, 0, 0),
      });
    }
  });

  page.drawText(`Liaison DC : ${input.dcRun.sectionMm2} mm² — ${input.dcRun.lengthM} m`, {
    x: 40, y: rowY - 40, size: 10, font, color: rgb(0, 0, 0),
  });
  page.drawText(`Liaison AC : ${input.acRun.sectionMm2} mm² — ${input.acRun.lengthM} m`, {
    x: 40, y: rowY - 60, size: 10, font, color: rgb(0, 0, 0),
  });
  page.drawText(`Mise à la terre : ${input.earthRodCount} piquet(s)`, {
    x: 40, y: rowY - 80, size: 10, font, color: rgb(0, 0, 0),
  });
}

export async function renderDrawingPages(input: DrawingsInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  drawSingleLine(doc, input, font);
  drawUnifilar(doc, input, font);

  return Buffer.from(await doc.save());
}
