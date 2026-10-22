import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { wrapPdfText } from './pdf-text';
import { embedLogo } from './render-cover-page';
import {
  A4_LANDSCAPE,
  BLACK,
  CONDUCTOR_COLORS,
  MIN_TEXT_SIZE,
  clip,
  conductor,
  drawSheet,
  enclosure,
  label,
  legend,
  type DrawingCartouche,
  type Fonts,
  type Rect,
} from './drawing-kit';
import { drawSymbol, SYMBOLS, type Point, type SymbolKind } from './drawing-symbols';

export type { DrawingCartouche } from './drawing-kit';

export interface DeviceRating {
  /** What the device is (`Interrupteur-sectionneur DC`). */
  label: string;
  /** Its reference designation on the drawing (`Q1`). */
  ref: string;
  /** Its rating lines, printed under the designation (`Un 1000 V`, `In 16 A`). */
  lines: string[];
}

export interface EarthingDrawingInput {
  mode: 'DEDICATED_ROD' | 'BUILDING_EARTH';
  mainMm2: number;
  frameMm2: number;
  toPitMm2: number;
  targetOhm: number;
}

export interface SingleLineInput {
  pvField: { moduleRef: string; moduleCount: number; strings: number; modulesPerString: number; stringVocTminV: number; iscA: number };
  dcCable: { ref: string; sectionMm2: number; lengthM: number };
  dcSwitch: DeviceRating;
  dcSpd: DeviceRating;
  dcFuse: DeviceRating | null;
  inverter: DeviceRating;
  acCable: { ref: string; sectionMm2: number; lengthM: number };
  acBreaker: DeviceRating;
  acSpd: DeviceRating;
  agcp: { calibreA: string | null };
  earthing: EarthingDrawingInput;
  cartouche: DrawingCartouche;
}

const frNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const fr = (value: number): string => frNumber.format(value);

const LINE_H = MIN_TEXT_SIZE * 1.2;
const GREY = rgb(0.35, 0.35, 0.35);

interface Sheet {
  doc: PDFDocument;
  page: PDFPage;
  fonts: Fonts;
  area: Rect;
  legendRect: Rect;
}

async function newSheet(cartouche: DrawingCartouche, drawingTitle: string, planNumber: number): Promise<Sheet> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
  };
  const page = doc.addPage(A4_LANDSCAPE);
  const logo = await embedLogo(doc, cartouche.logo);
  const { legend: legendRect, ...area } = drawSheet(page, fonts, { ...cartouche, logo, drawingTitle, planNumber, pageLabel: 'Feuille 1/1' });
  return { doc, page, fonts, area, legendRect };
}

interface TextLine {
  text: string;
  bold: boolean;
}

/** A designation (bold) followed by wrapped regular paragraphs, all wrapped to `width`. */
function blockLines(fonts: Fonts, designation: string, paragraphs: string[], width: number): TextLine[] {
  return [
    ...wrapPdfText(fonts.bold, designation, MIN_TEXT_SIZE, width).map((text) => ({ text, bold: true })),
    ...paragraphs.flatMap((p) => wrapPdfText(fonts.regular, p, MIN_TEXT_SIZE, width).map((text) => ({ text, bold: false }))),
  ];
}

/** Draws lines centred on `cx`, the last line's baseline at `baseY`; returns the block height. */
function drawBlockUp(sheet: Sheet, cx: number, baseY: number, lines: TextLine[]): number {
  lines.forEach((line, i) => {
    const font = line.bold ? sheet.fonts.bold : sheet.fonts.regular;
    const width = font.widthOfTextAtSize(line.text, MIN_TEXT_SIZE);
    label(sheet.page, font, line.text, { x: cx - width / 2, y: baseY + (lines.length - 1 - i) * LINE_H });
  });
  return lines.length * LINE_H;
}

function hLine(sheet: Sheet, x1: number, x2: number, y: number, kind: keyof typeof CONDUCTOR_COLORS): void {
  sheet.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 1, color: CONDUCTOR_COLORS[kind] });
}

function junction(sheet: Sheet, at: Point): void {
  sheet.page.drawCircle({ x: at.x, y: at.y, size: 1.8, color: BLACK });
}

function sectionText(run: { ref: string; sectionMm2: number; lengthM: number }, poles: string, fonts: Fonts, width: number): string[] {
  return [run.ref, `${poles} × ${fr(run.sectionMm2)} mm²`, `— ${fr(run.lengthM)} m`].map((line) => clip(fonts.regular, line, MIN_TEXT_SIZE, width));
}

function strings(count: number, modules: number): string {
  return count === 1 ? `1 chaîne de ${modules} modules` : `${count} chaînes de ${modules} modules`;
}

function earthSideText(earthing: EarthingDrawingInput): string[] {
  return earthing.mode === 'BUILDING_EARTH' ? ['Terre existante du bâtiment'] : ['Piquet de terre', `R max. ${fr(earthing.targetOhm)} ohms`];
}

/** The earth network below a PE bus: terminal block at `at`, then the electrode with its text. */
function drawEarthEnd(sheet: Sheet, at: Point, earthing: EarthingDrawingInput): void {
  const block = drawSymbol(sheet.page, 'distributionBlock', { x: at.x - SYMBOLS.distributionBlock.width / 2, y: at.y });
  label(sheet.page, sheet.fonts.regular, 'Répartiteur de terre', { x: at.x + 20, y: at.y - 9 });
  const electrodeTop = block.earth!.y - 26;
  conductor(sheet.page, sheet.fonts.regular, block.earth!, { x: block.earth!.x, y: electrodeTop }, 'pe', `1 × ${fr(earthing.toPitMm2)} mm²`);
  const electrode = drawSymbol(sheet.page, 'earth', { x: at.x - SYMBOLS.earth.width / 2, y: electrodeTop });
  earthSideText(earthing).forEach((line, i) => label(sheet.page, sheet.fonts.regular, line, { x: at.x + 20, y: electrode.in.y - 6 - i * LINE_H }));
}

// ---------------------------------------------------------------------------------------------
// Single-line diagram (plan N°4)
// ---------------------------------------------------------------------------------------------

export async function renderSingleLineDiagram(input: SingleLineInput): Promise<Buffer> {
  const sheet = await newSheet(input.cartouche, 'Schéma unifilaire', 4);
  const { page, fonts, area } = sheet;
  const mainY = area.y + area.height - 115;
  const busY = area.y + 125;
  const textBase = mainY + 22;

  // Column widths, left to right; scaled down together when they do not fit the sheet.
  const hasFuse = input.dcFuse !== null;
  const widths = {
    pv: 88, dcCable: 54, q1: 52, f1: hasFuse ? 52 : 0, spd1: 52, link1: 14, inverter: 78, acCable: 52,
    q2: 58, spd2: 52, link2: 10, agcp: 66, meter: 50, grid: 50,
  };
  const padding = 4;
  const total = Object.values(widths).reduce((a, b) => a + b, 0) + 4 * padding + 2 * padding;
  const k = Math.min(1, (area.width - 6) / total);
  const w = Object.fromEntries(Object.entries(widths).map(([key, value]) => [key, value * k])) as typeof widths;

  let x = area.x + 2;
  const take = (width: number): { left: number; right: number; cx: number } => {
    const col = { left: x, right: x + width, cx: x + width / 2 };
    x += width;
    return col;
  };

  const pv = take(w.pv);
  const dcCable = take(w.dcCable);
  x += padding * k;
  const coffretDcLeft = x - padding * k;
  const q1 = take(w.q1);
  const f1 = hasFuse ? take(w.f1) : null;
  const spd1 = take(w.spd1);
  x += padding * k;
  const coffretDcRight = x;
  take(w.link1);
  const inverter = take(w.inverter);
  const acCable = take(w.acCable);
  x += padding * k;
  const coffretAcLeft = x - padding * k;
  const q2 = take(w.q2);
  const spd2 = take(w.spd2);
  x += padding * k;
  const coffretAcRight = x;
  take(w.link2);
  x += padding * k;
  const boardLeft = x - padding * k;
  const agcp = take(w.agcp);
  x += padding * k;
  const boardRight = x;
  const meter = take(w.meter);
  const grid = take(w.grid);

  const textWidth = (col: { left: number; right: number }): number => col.right - col.left - 2;
  const rated = (col: { left: number; right: number }, device: DeviceRating): TextLine[] =>
    blockLines(fonts, device.ref, [device.label, ...device.lines], textWidth(col));

  // Text blocks first, so the enclosures can be sized to the tallest block they hold.
  const pvLines = blockLines(
    fonts,
    'Champ PV',
    [
      `${input.pvField.moduleCount} × ${input.pvField.moduleRef}`,
      strings(input.pvField.strings, input.pvField.modulesPerString),
      `Voc(Tmin) ${fr(input.pvField.stringVocTminV)} V · Isc ${fr(input.pvField.iscA)} A`,
    ],
    textWidth(pv),
  );
  const q1Lines = rated(q1, input.dcSwitch);
  const f1Lines = f1 && input.dcFuse ? rated(f1, input.dcFuse) : [];
  const spd1Lines = rated(spd1, input.dcSpd);
  const inverterLines = rated(inverter, input.inverter);
  const q2Lines = rated(q2, input.acBreaker);
  const spd2Lines = rated(spd2, input.acSpd);
  const agcpLines = blockLines(
    fonts,
    'AGCP',
    [
      input.agcp.calibreA
        ? `Disjoncteur de branchement STEG (AGCP) ${input.agcp.calibreA} A`
        : 'Disjoncteur de branchement STEG (AGCP) calibre à relever sur le disjoncteur de branchement',
    ],
    textWidth(agcp),
  );
  const meterLines = blockLines(fonts, 'kWh', ['Compteur bidirectionnel STEG'], textWidth(meter));
  const gridLines = blockLines(fonts, 'Réseau', ['STEG BT 230 V'], textWidth(grid));

  const tallest = (...blocks: TextLine[][]): number => Math.max(...blocks.map((b) => b.length)) * LINE_H;
  const enclosureBottom = mainY - 46;
  const enclosureTop = (...blocks: TextLine[][]): number => textBase + tallest(...blocks) + 12;

  // Enclosures behind everything else.
  const dcTop = enclosureTop(q1Lines, f1Lines, spd1Lines);
  enclosure(page, fonts.bold, { x: coffretDcLeft, y: enclosureBottom, width: coffretDcRight - coffretDcLeft, height: dcTop - enclosureBottom }, 'Coffret DC');
  const acTop = enclosureTop(q2Lines, spd2Lines);
  enclosure(page, fonts.bold, { x: coffretAcLeft, y: enclosureBottom, width: coffretAcRight - coffretAcLeft, height: acTop - enclosureBottom }, 'Coffret AC');
  const boardName = wrapPdfText(fonts.bold, 'Tableau électrique existant du client', MIN_TEXT_SIZE, boardRight - boardLeft - 8);
  const boardTop = textBase + agcpLines.length * LINE_H + 8 + boardName.length * LINE_H;
  page.drawRectangle({
    x: boardLeft, y: enclosureBottom, width: boardRight - boardLeft, height: boardTop - enclosureBottom, borderColor: GREY, borderWidth: 1, borderDashArray: [5, 3],
  });
  boardName.forEach((line, i) => label(page, fonts.bold, line, { x: boardLeft + 4, y: boardTop - 9 - i * LINE_H }));

  // Main line: DC red, AC brown (the cable labels give the section, so a monochrome print reads too).
  const pvSymbol = drawSymbol(page, 'pvString', { x: pv.cx - SYMBOLS.pvString.width / 2, y: mainY + SYMBOLS.pvString.height / 2 });
  drawBlockUp(sheet, pv.cx, textBase, pvLines);

  const placeSeries = (col: { cx: number }, kind: SymbolKind, lines: TextLine[]): { in: Point; out: Point } => {
    const def = SYMBOLS[kind];
    const anchors = drawSymbol(page, kind, { x: col.cx - def.width / 2, y: mainY + def.height / 2 });
    drawBlockUp(sheet, col.cx, textBase, lines);
    return anchors;
  };
  const placeShunt = (col: { cx: number }, lines: TextLine[], kind: 'dcPlus' | 'acPhase'): Point => {
    junction(sheet, { x: col.cx, y: mainY });
    const def = SYMBOLS.spd;
    const top = { x: col.cx - def.width / 2, y: mainY - 8 };
    const anchors = drawSymbol(page, 'spd', top);
    conductor(page, fonts.regular, { x: col.cx, y: mainY }, anchors.in, kind);
    drawBlockUp(sheet, col.cx, textBase, lines);
    return anchors.earth!;
  };

  const q1Anchors = placeSeries(q1, 'switchDisconnector', q1Lines);
  const f1Anchors = f1 ? placeSeries(f1, 'fuse', f1Lines) : null;
  const spd1Earth = placeShunt(spd1, spd1Lines, 'dcPlus');
  const inverterAnchors = placeSeries(inverter, 'inverter', inverterLines);
  const q2Anchors = placeSeries(q2, 'rcdBreaker', q2Lines);
  const spd2Earth = placeShunt(spd2, spd2Lines, 'acPhase');
  const agcpAnchors = placeSeries(agcp, 'breaker', agcpLines);
  const meterAnchors = placeSeries(meter, 'meter', meterLines);
  drawBlockUp(sheet, grid.cx, textBase, gridLines);

  // Wires between the symbols.
  const dcLabel = sectionText(input.dcCable, '2 × 1', fonts, textWidth(dcCable));
  conductor(page, fonts.regular, pvSymbol.out, { x: q1Anchors.in.x, y: mainY }, 'dcPlus', dcLabel);
  hLine(sheet, q1Anchors.out.x, (f1Anchors ?? inverterAnchors).in.x, mainY, 'dcPlus');
  if (f1Anchors) hLine(sheet, f1Anchors.out.x, inverterAnchors.in.x, mainY, 'dcPlus');
  const acLabel = sectionText(input.acCable, '3', fonts, textWidth(acCable));
  conductor(page, fonts.regular, inverterAnchors.out, { x: q2Anchors.in.x, y: mainY }, 'acPhase', acLabel);
  hLine(sheet, q2Anchors.out.x, agcpAnchors.in.x, mainY, 'acPhase');
  hLine(sheet, agcpAnchors.out.x, meterAnchors.in.x, mainY, 'acPhase');
  hLine(sheet, meterAnchors.out.x, grid.cx, mainY, 'acPhase');

  // PE network: frames, both SPDs and the inverter to the bus, then the terminal block and the electrode.
  const blockX = Math.min(spd2.cx + 36, grid.left - 20);
  const equipotential = `liaison équipotentielle ${fr(input.earthing.frameMm2)} mm²`;
  conductor(page, fonts.regular, { x: pv.cx, y: mainY - SYMBOLS.pvString.height / 2 }, { x: pv.cx, y: busY }, 'pe', [equipotential]);
  conductor(page, fonts.regular, spd1Earth, { x: spd1Earth.x, y: busY }, 'pe', []);
  conductor(page, fonts.regular, { x: inverter.cx, y: mainY - SYMBOLS.inverter.height / 2 }, { x: inverter.cx, y: busY }, 'pe', []);
  conductor(page, fonts.regular, spd2Earth, { x: spd2Earth.x, y: busY }, 'pe', []);
  conductor(page, fonts.regular, { x: pv.cx, y: busY }, { x: blockX, y: busY }, 'pe', [`PE ${fr(input.earthing.mainMm2)} mm²`], { labelSide: 'below' });
  for (const cx of [spd1Earth.x, inverter.cx, spd2Earth.x]) junction(sheet, { x: cx, y: busY });
  drawEarthEnd(sheet, { x: blockX, y: busY }, input.earthing);
  label(page, fonts.bold, 'Schéma de liaison à la terre : TT', { x: area.x + 4, y: busY - 40 }, 8);

  legend(
    page,
    fonts.regular,
    [
      { kind: 'pvString', text: 'Champ photovoltaïque' },
      { kind: 'switchDisconnector', text: 'Interrupteur-sectionneur' },
      { kind: 'fuse', text: 'Fusible gPV' },
      { kind: 'spd', text: 'Parafoudre' },
      { kind: 'inverter', text: 'Onduleur' },
      { kind: 'rcdBreaker', text: 'Disjoncteur différentiel' },
      { kind: 'breaker', text: 'Disjoncteur' },
      { kind: 'meter', text: 'Compteur bidirectionnel' },
      { kind: 'earth', text: 'Prise de terre' },
    ].filter((entry) => hasFuse || entry.kind !== 'fuse') as { kind: SymbolKind; text: string }[],
    sheet.legendRect,
  );

  return Buffer.from(await sheet.doc.save());
}

// ---------------------------------------------------------------------------------------------
// Panel string wiring diagram (plan N°7)
// ---------------------------------------------------------------------------------------------

export interface PanelWiringInput {
  strings: { modules: number }[];
  moduleRef: string;
  dcCable: { ref: string; sectionMm2: number };
  frameMm2: number;
  toPitMm2: number;
  earthing: EarthingDrawingInput;
  cartouche: DrawingCartouche;
}

const MODULE_BOX = { width: 34, height: 22, gap: 10 };
const MAX_DRAWN_MODULES = 12;
const MAX_DRAWN_STRINGS = 5;

/** `1…m` when the string is short; otherwise P1–P3, an ellipsis and the last two. */
function drawnModules(count: number): (number | null)[] {
  if (count <= MAX_DRAWN_MODULES) return Array.from({ length: count }, (_, i) => i + 1);
  return [1, 2, 3, null, count - 1, count];
}

/** The strings drawn as rows: all of them, or the first two and the last when there are many. */
function drawnStrings(count: number): (number | null)[] {
  if (count <= MAX_DRAWN_STRINGS) return Array.from({ length: count }, (_, i) => i);
  return [0, 1, null, count - 1];
}

export async function renderPanelWiringDiagram(input: PanelWiringInput): Promise<Buffer> {
  const sheet = await newSheet(input.cartouche, 'Câblage des panneaux', 7);
  const { page, fonts, area } = sheet;
  const font = fonts.regular;

  const rows = drawnStrings(input.strings.length);
  const firstY = area.y + area.height - 40;
  const lastMinY = area.y + 105;
  const rowH = rows.length > 1 ? Math.min(78, (firstY - lastMinY) / (rows.length - 1)) : 78;
  const rowY = (index: number): number => firstY - index * rowH;
  const lastY = rowY(rows.length - 1);

  const coffret: Rect = { x: area.x + area.width - 112, y: lastY - 40, width: 108, height: firstY + 34 - (lastY - 40) };
  enclosure(page, fonts.bold, coffret, 'Coffret DC');
  label(page, font, 'Vers onduleur', { x: coffret.x + 8, y: coffret.y + coffret.height / 2 });

  const busX = area.x + 6;
  const startX = area.x + 72;
  const cableText = `${input.dcCable.ref} 1 × ${fr(input.dcCable.sectionMm2)} mm²`;
  const railYs: number[] = [];

  rows.forEach((stringIndex, rowIndex) => {
    const yc = rowY(rowIndex);
    if (stringIndex === null) {
      label(page, font, `Chaînes 3 à ${input.strings.length - 1} identiques`, { x: startX, y: yc - 3 });
      label(page, font, '(non représentées)', { x: startX, y: yc - 12 });
      return;
    }
    const modules = input.strings[stringIndex]!.modules;
    const shown = drawnModules(modules);
    label(page, fonts.bold, `Chaîne ${stringIndex + 1}`, { x: busX + 12, y: yc + 2 });
    label(page, font, `${modules} modules`, { x: busX + 12, y: yc - 7 });

    const boxLeft = (j: number): number => startX + j * (MODULE_BOX.width + MODULE_BOX.gap);
    shown.forEach((moduleNumber, j) => {
      const x = boxLeft(j);
      if (moduleNumber === null) {
        page.drawRectangle({ x, y: yc - MODULE_BOX.height / 2, width: MODULE_BOX.width, height: MODULE_BOX.height, borderColor: GREY, borderWidth: 1, borderDashArray: [3, 2] });
        const w = font.widthOfTextAtSize('…', MIN_TEXT_SIZE);
        label(page, font, '…', { x: x + (MODULE_BOX.width - w) / 2, y: yc - 2.5 });
      } else {
        page.drawRectangle({ x, y: yc - MODULE_BOX.height / 2, width: MODULE_BOX.width, height: MODULE_BOX.height, borderColor: BLACK, borderWidth: 1, color: rgb(1, 1, 1) });
        page.drawLine({ start: { x, y: yc - MODULE_BOX.height / 2 }, end: { x: x + MODULE_BOX.width, y: yc + MODULE_BOX.height / 2 }, thickness: 0.4, color: GREY });
        const text = `P${moduleNumber}`;
        const w = fonts.bold.widthOfTextAtSize(text, MIN_TEXT_SIZE);
        label(page, fonts.bold, text, { x: x + (MODULE_BOX.width - w) / 2, y: yc - 2.5 });
      }
      if (j > 0) page.drawLine({ start: { x: boxLeft(j - 1) + MODULE_BOX.width, y: yc }, end: { x, y: yc }, thickness: 1, color: BLACK });
    });

    const firstLeft = boxLeft(0);
    const lastRight = boxLeft(shown.length - 1) + MODULE_BOX.width;
    // + from the last module, − returns under the modules, both to the coffret.
    conductor(page, font, { x: lastRight, y: yc }, { x: coffret.x, y: yc }, 'dcPlus', cableText);
    label(page, fonts.bold, '+', { x: lastRight + 3, y: yc + 3 }, 9, CONDUCTOR_COLORS.dcPlus);
    conductor(page, font, { x: firstLeft, y: yc }, { x: firstLeft - 10, y: yc }, 'dcMinus');
    conductor(page, font, { x: firstLeft - 10, y: yc }, { x: firstLeft - 10, y: yc - 19 }, 'dcMinus');
    conductor(page, font, { x: firstLeft - 10, y: yc - 19 }, { x: coffret.x, y: yc - 19 }, 'dcMinus', cableText, { labelSide: 'below' });
    label(page, fonts.bold, '−', { x: firstLeft - 9, y: yc + 3 }, 9);

    // PE rail over the frames, with a stub from each drawn module.
    const railY = yc + 19;
    railYs.push(railY);
    conductor(page, font, { x: busX, y: railY }, { x: lastRight, y: railY }, 'pe', rowIndex === 0 ? [`1 × ${fr(input.frameMm2)} mm²`] : []);
    shown.forEach((moduleNumber, j) => {
      if (moduleNumber === null) return;
      conductor(page, font, { x: boxLeft(j) + MODULE_BOX.width / 2, y: yc + MODULE_BOX.height / 2 }, { x: boxLeft(j) + MODULE_BOX.width / 2, y: railY }, 'pe', []);
    });
  });

  const busBottom = lastY - 45;
  conductor(page, font, { x: busX, y: railYs[0]! }, { x: busX, y: busBottom }, 'pe', []);
  for (const railY of railYs.slice(1)) page.drawCircle({ x: busX, y: railY, size: 1.8, color: BLACK });
  drawEarthEnd(sheet, { x: busX + 14, y: busBottom }, input.earthing);
  conductor(page, font, { x: busX, y: busBottom }, { x: busX + 14, y: busBottom }, 'pe', []);

  legend(
    page,
    font,
    [
      { kind: 'pvString', text: `Module ${input.moduleRef}` },
      { kind: 'distributionBlock', text: 'Répartiteur de terre' },
      { kind: 'earth', text: 'Prise de terre' },
    ],
    sheet.legendRect,
  );
  return Buffer.from(await sheet.doc.save());
}

// ---------------------------------------------------------------------------------------------
// DC box wiring diagram (plan N°8)
// ---------------------------------------------------------------------------------------------

export interface DcBoxInput {
  strings: number;
  dcSwitch: DeviceRating;
  dcSpd: DeviceRating;
  dcFuse: DeviceRating | null;
  dcCable: { ref: string; sectionMm2: number; lengthM: number };
  earthing: EarthingDrawingInput;
  cartouche: DrawingCartouche;
}

const MAX_BOX_STRINGS = 5;
const ROW_PITCH = 22;

export async function renderDcBoxDiagram(input: DcBoxInput): Promise<Buffer> {
  const sheet = await newSheet(input.cartouche, 'Câblage du coffret DC', 8);
  const { page, fonts, area } = sheet;
  const font = fonts.regular;
  const n = Math.min(input.strings, MAX_BOX_STRINGS);

  const top = area.y + area.height - 10;
  const plusY = (k: number): number => top - 85 - k * ROW_PITCH;
  const minusY = (k: number): number => plusY(n - 1) - 40 - k * ROW_PITCH;
  const outPlus = plusY(0);
  const outMinus = minusY(n - 1);
  const box: Rect = { x: area.x + 130, y: outMinus - 6 - SYMBOLS.spd.height - 26, width: area.width - 130 - 200, height: 0 };
  box.height = top - box.y;
  enclosure(page, fonts.bold, box, 'Coffret DC');

  const fuseX = box.x + 40;
  const busX = box.x + 150;
  const switchX = busX + 60;
  const spdX = busX + 150;

  const fuseScale = 0.7;
  const fuseDef = SYMBOLS.fuse;
  const fuseRating = input.dcFuse ? blockLines(fonts, input.dcFuse.ref, [input.dcFuse.label, ...input.dcFuse.lines], 80) : [];
  const stringLabel = (k: number, sign: '+' | '−'): string => `Chaîne ${k + 1} (${sign})`;
  for (let k = 0; k < n; k += 1) {
    for (const [sign, y, kind] of [['+', plusY(k), 'dcPlus'], ['−', minusY(k), 'dcMinus']] as const) {
      conductor(page, font, { x: area.x + 4, y }, { x: box.x, y }, kind, stringLabel(k, sign));
      if (input.dcFuse) {
        const anchors = drawSymbol(page, 'fuse', { x: fuseX - (fuseDef.width * fuseScale) / 2, y: y + (fuseDef.height * fuseScale) / 2 }, { scale: fuseScale });
        conductor(page, font, { x: box.x, y }, anchors.in, kind);
        conductor(page, font, anchors.out, { x: busX, y }, kind);
      } else {
        conductor(page, font, { x: box.x, y }, { x: busX, y }, kind);
      }
    }
  }
  if (input.strings > n) label(page, font, `… ${input.strings - n} autres chaînes identiques`, { x: area.x + 4, y: minusY(n - 1) - 22 });
  if (input.dcFuse) drawBlockUp(sheet, fuseX, plusY(0) + 18, fuseRating);

  if (n > 1) {
    page.drawLine({ start: { x: busX, y: plusY(0) }, end: { x: busX, y: plusY(n - 1) }, thickness: 2, color: CONDUCTOR_COLORS.dcPlus });
    page.drawLine({ start: { x: busX, y: minusY(0) }, end: { x: busX, y: minusY(n - 1) }, thickness: 2, color: CONDUCTOR_COLORS.dcMinus });
  }
  // The combined polarities: the bar's outgoing wire is the first row's (+) and the last row's (−).
  const outLinks: [number, 'dcPlus' | 'dcMinus'][] = [[outPlus, 'dcPlus'], [outMinus, 'dcMinus']];
  const switchDef = SYMBOLS.switchDisconnector;
  const switchLines = blockLines(fonts, input.dcSwitch.ref, [input.dcSwitch.label, ...input.dcSwitch.lines], 90);
  for (const [y, kind] of outLinks) {
    const anchors = drawSymbol(page, 'switchDisconnector', { x: switchX - switchDef.width / 2, y: y + switchDef.height / 2 });
    conductor(page, font, { x: busX, y }, anchors.in, kind);
    conductor(page, font, anchors.out, { x: box.x + box.width, y }, kind);
  }
  drawBlockUp(sheet, switchX, outPlus + 22, switchLines);

  // Surge protector: one varistor from each polarity to the PE rail.
  const spdDef = SYMBOLS.spd;
  const spdTopY = outMinus - 6;
  const railY = spdTopY - spdDef.height;
  conductor(page, font, { x: spdX, y: outPlus }, { x: spdX, y: spdTopY }, 'dcPlus');
  page.drawCircle({ x: spdX, y: outPlus, size: 1.8, color: BLACK });
  const spdPlus = drawSymbol(page, 'spd', { x: spdX - spdDef.width / 2, y: spdTopY });
  const spdMinusX = spdX + 30;
  page.drawCircle({ x: spdMinusX, y: outMinus, size: 1.8, color: BLACK });
  conductor(page, font, { x: spdMinusX, y: outMinus }, { x: spdMinusX, y: spdTopY }, 'dcMinus');
  const spdMinus = drawSymbol(page, 'spd', { x: spdMinusX - spdDef.width / 2, y: spdTopY });
  drawBlockUp(sheet, spdX + 15, outPlus + 22, blockLines(fonts, input.dcSpd.ref, [input.dcSpd.label, ...input.dcSpd.lines], 110));
  const railEnd = box.x + box.width + 30;
  conductor(page, font, { x: spdPlus.earth!.x - 12, y: railY }, { x: railEnd, y: railY }, 'pe', 'PE');
  page.drawCircle({ x: spdPlus.earth!.x, y: railY, size: 1.8, color: BLACK });
  page.drawCircle({ x: spdMinus.earth!.x, y: railY, size: 1.8, color: BLACK });
  drawEarthEnd(sheet, { x: railEnd, y: railY }, input.earthing);

  const outX = box.x + box.width;
  conductor(
    page,
    font,
    { x: outX, y: outPlus },
    { x: outX + 190, y: outPlus },
    'dcPlus',
    [`Vers onduleur — ${input.dcCable.ref}`, `2 × 1 × ${fr(input.dcCable.sectionMm2)} mm² — ${fr(input.dcCable.lengthM)} m`],
  );
  conductor(page, font, { x: outX, y: outMinus }, { x: outX + 190, y: outMinus }, 'dcMinus');

  legend(
    page,
    font,
    [
      ...(input.dcFuse ? [{ kind: 'fuse' as const, text: 'Fusible gPV' }] : []),
      { kind: 'switchDisconnector', text: 'Interrupteur-sectionneur' },
      { kind: 'spd', text: 'Parafoudre' },
      { kind: 'distributionBlock', text: 'Répartiteur de terre' },
      { kind: 'earth', text: 'Prise de terre' },
    ],
    sheet.legendRect,
  );
  return Buffer.from(await sheet.doc.save());
}

// ---------------------------------------------------------------------------------------------
// AC box wiring diagram (plan N°9)
// ---------------------------------------------------------------------------------------------

export interface AcBoxInput {
  acBreaker: DeviceRating;
  acSpd: DeviceRating;
  acCable: { ref: string; sectionMm2: number; lengthM: number };
  earthing: EarthingDrawingInput;
  agcp: { calibreA: string | null };
  cartouche: DrawingCartouche;
}

export async function renderAcBoxDiagram(input: AcBoxInput): Promise<Buffer> {
  const sheet = await newSheet(input.cartouche, 'Câblage du coffret AC', 9);
  const { page, fonts, area } = sheet;
  const font = fonts.regular;

  const top = area.y + area.height - 10;
  const yL = top - 95;
  const yN = yL - 26;
  const yPE = yN - 34;
  const box: Rect = { x: area.x + 170, y: yPE - 26, width: area.width - 170 - 190, height: top - (yPE - 26) };
  enclosure(page, fonts.bold, box, 'Coffret AC');
  const right = box.x + box.width;

  const breakerX = box.x + 80;
  const spdX = breakerX + 150;

  const rcdDef = SYMBOLS.rcdBreaker;
  const breakerDef = SYMBOLS.breaker;
  const rcd = drawSymbol(page, 'rcdBreaker', { x: breakerX - rcdDef.width / 2, y: yL + rcdDef.height / 2 });
  const neutral = drawSymbol(page, 'breaker', { x: breakerX - breakerDef.width / 2, y: yN + breakerDef.height / 2 });
  drawBlockUp(sheet, breakerX, yL + 22, blockLines(fonts, input.acBreaker.ref, [input.acBreaker.label, ...input.acBreaker.lines], 100));

  conductor(
    page,
    font,
    { x: area.x + 4, y: yL },
    { x: box.x, y: yL },
    'acPhase',
    ["Depuis l'onduleur — L / N / PE", `${input.acCable.ref} 3 × ${fr(input.acCable.sectionMm2)} mm² — ${fr(input.acCable.lengthM)} m`],
  );
  conductor(page, font, { x: area.x + 4, y: yN }, { x: box.x, y: yN }, 'acNeutral', 'N', { labelSide: 'below' });
  conductor(page, font, { x: area.x + 4, y: yPE }, { x: right + 150, y: yPE }, 'pe', 'PE', { labelSide: 'below' });
  conductor(page, font, { x: box.x, y: yL }, rcd.in, 'acPhase');
  conductor(page, font, { x: box.x, y: yN }, neutral.in, 'acNeutral');

  const spdDef = SYMBOLS.spd;
  const spdTopY = yN - 6;
  page.drawCircle({ x: spdX, y: yL, size: 1.8, color: BLACK });
  conductor(page, font, { x: spdX, y: yL }, { x: spdX, y: spdTopY }, 'acPhase');
  const spd = drawSymbol(page, 'spd', { x: spdX - spdDef.width / 2, y: spdTopY });
  page.drawCircle({ x: spd.earth!.x, y: yPE, size: 1.8, color: BLACK });
  drawBlockUp(sheet, spdX, yL + 22, blockLines(fonts, input.acSpd.ref, [input.acSpd.label, ...input.acSpd.lines], 100));
  conductor(page, font, rcd.out, { x: right, y: yL }, 'acPhase');
  conductor(page, font, neutral.out, { x: right, y: yN }, 'acNeutral');
  conductor(page, font, { x: right, y: yL }, { x: right + 150, y: yL }, 'acPhase', ["Vers point d'injection", '(tableau existant — compteur STEG)']);
  conductor(page, font, { x: right, y: yN }, { x: right + 150, y: yN }, 'acNeutral');

  const earthX = box.x + 40;
  page.drawCircle({ x: earthX, y: yPE, size: 1.8, color: BLACK });
  conductor(page, font, { x: earthX, y: yPE }, { x: earthX, y: yPE - 50 }, 'pe', []);
  drawEarthEnd(sheet, { x: earthX, y: yPE - 50 }, input.earthing);

  legend(
    page,
    font,
    [
      { kind: 'rcdBreaker', text: 'Disjoncteur différentiel 2P' },
      { kind: 'breaker', text: 'Pôle neutre protégé' },
      { kind: 'spd', text: 'Parafoudre' },
      { kind: 'distributionBlock', text: 'Répartiteur de terre' },
      { kind: 'earth', text: 'Prise de terre' },
    ],
    sheet.legendRect,
  );
  return Buffer.from(await sheet.doc.save());
}
