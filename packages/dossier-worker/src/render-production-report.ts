import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { DEFAULT_INVERTER_EFFICIENCY_PCT } from '@dossipv/engine';
import { drawPdfText, fitPdfText, toPdfSafeText, wrapPdfText } from './pdf-text';
import { embedLogo, formatFrenchDate } from './render-cover-page';
import { formatGpsDecimal } from './render-site-plan-pages';
import { drawHeader, drawPageFrame, type HeaderParts } from './stamp-study-pages';
import type { ProductionSimulation } from './run-simulation';

/**
 * Annex N°2: the PVGIS production simulation report, three A4 portrait pages in Times, framed
 * and headed like the study pages, each closed by its own cartouche:
 *   1. parameters, annual results, calculation method;
 *   2. the monthly balance table and the monthly production chart;
 *   3. the loss breakdown (PVGIS PVcalc and the engine), the comparison with PVcalc's multi-year
 *      average, the assumptions and the JRC source line.
 */

export interface ProductionReportContext {
  moduleRef: string;
  moduleCount: number;
  inverterRef: string;
  inverterPacW: number;
  /** Design voltage drops at the rated current, percent. */
  dcDropPct: number;
  acDropPct: number;
  dossierNumber: string | null;
  /** ISO date of the dossier. */
  dossierDate: string;
  installerName: string;
  /** The installer's logo for the header; null prints the name. */
  logo: Buffer | null;
  /** The STEG logo for the header, as on the study pages. */
  stegLogo?: Buffer | null | undefined;
  /** The module's data used by the method block; omitted, it is described in words. */
  moduleSpecs?: { pmaxW: number; tempCoeffPmaxPct: number; noctC?: number | null | undefined } | undefined;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_COUNT = 3;
const X0 = 50;
const X1 = PAGE_WIDTH - 50;
const CONTENT_WIDTH = X1 - X0;
/** Below the running header (logos end 30 + 30 pt under the top edge). */
const CONTENT_TOP = PAGE_HEIGHT - 80;
const CARTOUCHE = { x: 34, y: 34, width: PAGE_WIDTH - 68, height: 34 };
const DEFAULT_NOCT_C = 45;

const BLACK = rgb(0, 0, 0);
const INK_MUTED = rgb(0.3, 0.3, 0.3);
const AMBER = rgb(1, 0.753, 0); // FFC000, the reference's table header
const SALMON = rgb(0.984, 0.894, 0.835); // FBE4D5, the reference's label column
const GRID = rgb(0.8, 0.8, 0.8);
/** The document's value blue (1F4E9A): dark enough to print as a solid dark grey. */
const BAR_BLUE = rgb(0.122, 0.306, 0.604);
const EN_DASH = String.fromCodePoint(0x2013);
const EM_DASH = String.fromCodePoint(0x2014);
const NOT_AVAILABLE = 'non disponible';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MONTH_ABBREVIATIONS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

// ---------------------------------------------------------------------------------------------
// Formatting (fr-FR, decimal comma everywhere)

const number = (value: number, decimals: number): string =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
/** `+0,47 %`, `–2,57 %` (en dash as the minus sign), `0,0 %`. */
const signedPct = (value: number, decimals: number): string => {
  const rounded = Number(value.toFixed(decimals));
  const sign = rounded > 0 ? '+' : rounded < 0 ? EN_DASH : '';
  return `${sign}${number(Math.abs(rounded), decimals)} %`;
};
/** A loss given as a positive percentage, shown as a negative change. */
const lossPct = (value: number, decimals = 1): string => signedPct(-value, decimals);

const TUNIS_DATE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', day: '2-digit', month: '2-digit', year: 'numeric' });
const isoDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : TUNIS_DATE.format(date);
};

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

// ---------------------------------------------------------------------------------------------
// Page furniture: frame, header, cartouche, titles

interface PageFurniture {
  header: HeaderParts;
  cartoucheCells: { label: string; value: string }[];
}

function drawCartouche(page: PDFPage, furniture: PageFurniture, pageNumber: number, fonts: Fonts): void {
  const cells = [...furniture.cartoucheCells, { label: 'Pièce', value: `Annexe N°2 ${EM_DASH} page ${pageNumber}/${PAGE_COUNT}` }];
  const widths = [118, 92, CARTOUCHE.width - 118 - 92 - 128, 128];
  const { x, y, height } = CARTOUCHE;
  page.drawRectangle({ x, y, width: CARTOUCHE.width, height, borderColor: BLACK, borderWidth: 0.75 });
  let left = x;
  cells.forEach((cell, i) => {
    const width = widths[i]!;
    if (i > 0) page.drawLine({ start: { x: left, y }, end: { x: left, y: y + height }, thickness: 0.5, color: BLACK });
    drawPdfText(page, cell.label, { x: left + 5, y: y + height - 11, size: 7, font: fonts.regular, color: INK_MUTED });
    const fitted = fitPdfText(fonts.bold, cell.value, { size: 9.5, minSize: 7, maxWidth: width - 10, maxHeight: 11 });
    page.drawText(fitted.lines[0] ?? '', { x: left + 5, y: y + 7, size: fitted.size, font: fonts.bold, color: BLACK });
    left += width;
  });
}

function newPage(doc: PDFDocument, furniture: PageFurniture, fonts: Fonts): PDFPage {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageFrame(page);
  drawHeader(page, furniture.header, fonts);
  drawCartouche(page, furniture, doc.getPageCount(), fonts);
  return page;
}

function drawCentered(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color: RGB = BLACK): void {
  const fitted = fitPdfText(font, text, { size, minSize: 7, maxWidth: CONTENT_WIDTH, maxHeight: size * 1.3 });
  const line = fitted.lines[0] ?? '';
  page.drawText(line, { x: (PAGE_WIDTH - font.widthOfTextAtSize(line, fitted.size)) / 2, y, size: fitted.size, font, color });
}

/** `n. Title` in bold with a hairline across the content width. Returns the y below it. */
function drawSectionHeading(page: PDFPage, text: string, top: number, fonts: Fonts): number {
  const baseline = top - 12;
  drawPdfText(page, text, { x: X0, y: baseline, size: 12, font: fonts.bold, color: BLACK });
  page.drawLine({ start: { x: X0, y: baseline - 4 }, end: { x: X1, y: baseline - 4 }, thickness: 0.6, color: BLACK });
  return baseline - 12;
}

/** Wrapped paragraph; `indent` hangs continuation lines (numbered lists). Returns the y below it. */
function drawParagraph(
  page: PDFPage,
  text: string,
  top: number,
  fonts: Fonts,
  options: { size?: number; prefix?: string; indent?: number; font?: PDFFont; color?: RGB } = {},
): number {
  const size = options.size ?? 9.5;
  const indent = options.indent ?? 0;
  const lineHeight = size * 1.25;
  const font = options.font ?? fonts.regular;
  const lines = wrapPdfText(font, text, size, CONTENT_WIDTH - indent);
  let baseline = top - size;
  if (options.prefix) drawPdfText(page, options.prefix, { x: X0, y: baseline, size, font: fonts.bold, color: BLACK });
  for (const line of lines) {
    page.drawText(line, { x: X0 + indent, y: baseline, size, font, color: options.color ?? BLACK });
    baseline -= lineHeight;
  }
  return baseline + lineHeight - size * 0.45;
}

// ---------------------------------------------------------------------------------------------
// Tables: single 0.5 pt black borders, amber header row, salmon label column (Task 17 style)

interface TableColumn {
  width: number;
  align: 'left' | 'right' | 'center';
}

interface TableSpec {
  top: number;
  columns: TableColumn[];
  /** One label per column; `\n` splits a header in two lines (name, unit). */
  header?: string[];
  rows: string[][];
  /** First column shaded salmon (row labels). */
  labelColumn?: boolean;
  /** Row indexes printed in bold (a total row). */
  boldRows?: number[];
  size?: number;
}

const CELL_PADDING = 5;

function drawTable(page: PDFPage, spec: TableSpec, fonts: Fonts): number {
  const size = spec.size ?? 9.5;
  const lineHeight = size * 1.2;
  const minRowHeight = size + 5;
  const xs = spec.columns.reduce<number[]>((acc, column) => [...acc, acc[acc.length - 1]! + column.width], [X0]);
  const tableWidth = xs[xs.length - 1]! - X0;
  let top = spec.top;

  const cellLines = (text: string, column: TableColumn, font: PDFFont): { lines: string[]; size: number } => {
    const maxWidth = column.width - 2 * CELL_PADDING;
    if (column.align === 'left') return { lines: wrapPdfText(font, text, size, maxWidth), size };
    // Figures stay on one line: shrink rather than wrap a number.
    const fitted = fitPdfText(font, text, { size, minSize: 7, maxWidth, maxHeight: lineHeight });
    return { lines: fitted.lines.slice(0, 1), size: fitted.size };
  };

  const drawRow = (cells: string[], font: PDFFont, fill: (column: number) => RGB | null, header: boolean): void => {
    const laid = cells.map((text, i) =>
      header
        ? { lines: text.split('\n').flatMap((part) => wrapPdfText(font, part, size, spec.columns[i]!.width - 2 * CELL_PADDING)), size }
        : cellLines(text, spec.columns[i]!, font),
    );
    const height = Math.max(minRowHeight, ...laid.map((cell) => cell.lines.length * lineHeight + 4.5));
    spec.columns.forEach((column, i) => {
      const colour = fill(i);
      page.drawRectangle({ x: xs[i]!, y: top - height, width: column.width, height, borderColor: BLACK, borderWidth: 0.5, ...(colour ? { color: colour } : {}) });
      const cell = laid[i]!;
      const blockHeight = cell.lines.length * lineHeight;
      let baseline = top - (height - blockHeight) / 2 - cell.size * 0.95;
      for (const line of cell.lines) {
        const width = font.widthOfTextAtSize(line, cell.size);
        const align = header ? 'center' : column.align;
        const x = align === 'left' ? xs[i]! + CELL_PADDING : align === 'right' ? xs[i + 1]! - CELL_PADDING - width : xs[i]! + (column.width - width) / 2;
        page.drawText(line, { x, y: baseline, size: cell.size, font, color: BLACK });
        baseline -= lineHeight;
      }
    });
    top -= height;
  };

  if (spec.header) drawRow(spec.header, fonts.bold, () => AMBER, true);
  spec.rows.forEach((row, index) => {
    const bold = spec.boldRows?.includes(index) ?? false;
    drawRow(row, bold ? fonts.bold : fonts.regular, (column) => (spec.labelColumn && column === 0 ? SALMON : null), false);
  });
  // An outer border slightly heavier than the inner rules.
  page.drawRectangle({ x: X0, y: top, width: tableWidth, height: spec.top - top, borderColor: BLACK, borderWidth: 0.75 });
  return top;
}

const labelValueColumns = (labelWidth: number): TableColumn[] => [
  { width: labelWidth, align: 'left' },
  { width: CONTENT_WIDTH - labelWidth, align: 'left' },
];

// ---------------------------------------------------------------------------------------------
// The monthly chart (dataviz rules within pdf-lib: one series, one hue, no legend, thin bars with
// a rounded data end and a square baseline, recessive hairline grid, ink-coloured labels)

function niceStep(maxValue: number, targetTicks: number): number {
  const rough = maxValue / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** A bar with rounded top corners and a square base, as an SVG path from its top-left corner. */
function barPath(width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height);
  return `M 0 ${height} L 0 ${r} Q 0 0 ${r} 0 L ${width - r} 0 Q ${width} 0 ${width} ${r} L ${width} ${height} Z`;
}

function drawMonthlyChart(page: PDFPage, values: number[], box: { x: number; y: number; width: number; height: number }, fonts: Fonts): void {
  const plot = { x: box.x + 52, y: box.y + 34, width: box.width - 60, height: box.height - 50 };
  const max = Math.max(...values, 1);
  // About seven clean ticks, with just enough headroom for the value labels.
  const step = niceStep(max * 1.1, 7);
  const yMax = Math.ceil((max * 1.1) / step) * step;
  const yOf = (value: number): number => plot.y + (value / yMax) * plot.height;

  // Hairline gridlines and tick labels.
  for (let tick = 0; tick <= yMax + step / 1000; tick += step) {
    const y = yOf(tick);
    if (tick > 0) page.drawLine({ start: { x: plot.x, y }, end: { x: plot.x + plot.width, y }, thickness: 0.4, color: GRID });
    const label = number(tick, step < 1 ? 1 : 0);
    const width = fonts.regular.widthOfTextAtSize(toPdfSafeText(label), 8);
    drawPdfText(page, label, { x: plot.x - 5 - width, y: y - 2.8, size: 8, font: fonts.regular, color: INK_MUTED });
  }
  // Axis title, rotated, centred on the plot height.
  const axisTitle = 'Énergie injectée (kWh)';
  const titleWidth = fonts.regular.widthOfTextAtSize(axisTitle, 8.5);
  drawPdfText(page, axisTitle, { x: box.x + 10, y: plot.y + (plot.height - titleWidth) / 2, size: 8.5, font: fonts.regular, color: BLACK, rotate: degrees(90) });

  // Bars: capped width, the band's remainder left as air.
  const band = plot.width / values.length;
  const barWidth = Math.min(24, band * 0.62);
  values.forEach((value, i) => {
    const centre = plot.x + band * (i + 0.5);
    const top = yOf(value);
    const barHeight = top - plot.y;
    if (barHeight > 0) {
      page.drawSvgPath(barPath(barWidth, barHeight, 2.5), { x: centre - barWidth / 2, y: top, color: BAR_BLUE, borderWidth: 0 });
    }
    // Print has no hover: each column carries its value on the cap, in ink.
    const label = number(value, 0);
    const labelWidth = fonts.regular.widthOfTextAtSize(toPdfSafeText(label), 7.5);
    drawPdfText(page, label, { x: centre - labelWidth / 2, y: top + 3, size: 7.5, font: fonts.regular, color: BLACK });
    const month = MONTH_ABBREVIATIONS[i] ?? '';
    const monthWidth = fonts.regular.widthOfTextAtSize(toPdfSafeText(month), 8);
    drawPdfText(page, month, { x: centre - monthWidth / 2, y: plot.y - 11, size: 8, font: fonts.regular, color: BLACK });
  });
  // Baseline over the bar feet.
  page.drawLine({ start: { x: plot.x, y: plot.y }, end: { x: plot.x + plot.width, y: plot.y }, thickness: 0.8, color: BLACK });
  const xTitleWidth = fonts.regular.widthOfTextAtSize('Mois', 8.5);
  drawPdfText(page, 'Mois', { x: plot.x + (plot.width - xTitleWidth) / 2, y: box.y + 4, size: 8.5, font: fonts.regular, color: BLACK });
}

// ---------------------------------------------------------------------------------------------
// The three pages

/**
 * The JRC source line, in two parts when PVGIS named its database, so that each part is drawn
 * as its own line and the wrap never splits a name like « PVGIS-SARAH3 » at its hyphen.
 */
function sourceLines(sim: ProductionSimulation): string[] {
  const base = `Source : Commission européenne, Centre commun de recherche (JRC) ${EM_DASH} PVGIS v5.3`;
  if (!sim.pvgis.radiationDb) return [`${base}.`];
  const meteo = sim.pvgis.meteoDb ? `, données météorologiques ${sim.pvgis.meteoDb}` : '';
  return [`${base},`, `base de données de rayonnement ${sim.pvgis.radiationDb}${meteo}.`];
}

function drawSourceLines(page: PDFPage, sim: ProductionSimulation, top: number, fonts: Fonts, options: { size: number; font?: PDFFont; color?: RGB }): number {
  let y = top;
  for (const line of sourceLines(sim)) y = drawParagraph(page, line, y, fonts, options);
  return y;
}

function datesLine(sim: ProductionSimulation): string {
  const fetched = isoDate(sim.pvgis.fetchedAt);
  const simulated = isoDate(sim.simulatedAt);
  const parts = [fetched ? `données horaires PVGIS extraites le ${fetched}` : null, simulated ? `simulation calculée le ${simulated}` : null].filter(Boolean);
  if (parts.length === 0) return '';
  const text = parts.join(' ; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function horizonText(sim: ProductionSimulation): string {
  const { useHorizon, horizonSource } = sim.pvgis;
  if (useHorizon === null) return NOT_AVAILABLE;
  if (!useHorizon) return 'Non pris en compte';
  return horizonSource === 'DEM-calculated' ? 'Pris en compte (relief calculé par PVGIS, modèle numérique de terrain)' : `Pris en compte (${horizonSource ?? 'PVGIS'})`;
}

function orientationText(azimuthDeg: number): string {
  const value = azimuthDeg === 0 ? '0°' : `${azimuthDeg < 0 ? EN_DASH : '+'}${number(Math.abs(azimuthDeg), 0)}°`;
  const named = azimuthDeg === 0 ? 'plein sud' : azimuthDeg === -90 ? 'plein est' : azimuthDeg === 90 ? 'plein ouest' : azimuthDeg < 0 ? 'vers le sud-est' : 'vers le sud-ouest';
  return `${value} (${named}) ${EM_DASH} convention PVGIS : 0° = sud, ${EN_DASH}90° = est, +90° = ouest`;
}

function drawPageOne(page: PDFPage, sim: ProductionSimulation, ctx: ProductionReportContext, fonts: Fonts): void {
  let y = CONTENT_TOP;
  drawCentered(page, `ANNEXE N°2 ${EM_DASH} SIMULATION DE PRODUCTION`, y - 10, 10, fonts.bold, INK_MUTED);
  drawCentered(page, `Rapport de simulation de production ${EM_DASH} PVGIS v5.3 (JRC)`, y - 30, 15, fonts.bold);
  drawCentered(page, `Installation photovoltaïque de ${number(sim.installedKWp, 2)} kWc raccordée au réseau basse tension de la STEG`, y - 46, 10.5, fonts.regular);
  y -= 62;

  const pvcalc = sim.pvcalc;
  const databases = [sim.pvgis.radiationDb ? `rayonnement ${sim.pvgis.radiationDb}` : null, sim.pvgis.meteoDb ? `météo ${sim.pvgis.meteoDb}` : null].filter(Boolean).join(' ; ');
  const pmax = ctx.moduleSpecs ? ` (${number(ctx.moduleSpecs.pmaxW, 0)} Wc)` : '';
  const fetched = isoDate(sim.pvgis.fetchedAt);
  const simulated = isoDate(sim.simulatedAt) ?? formatFrenchDate(ctx.dossierDate);
  const rows: string[][] = [
    ['Site (coordonnées GPS)', formatGpsDecimal({ lat: sim.lat, lon: sim.lon })],
    ['Altitude du site', sim.pvgis.elevationM !== null ? `${number(sim.pvgis.elevationM, 0)} m (PVGIS)` : NOT_AVAILABLE],
    ['Inclinaison des modules', `${number(sim.tiltDeg, 0)}° par rapport à l'horizontale`],
    ['Orientation (azimut)', orientationText(sim.azimuthDeg)],
    ['Source des données', `PVGIS v5.3, série horaire ${sim.weatherYear}`],
    ['Bases de données PVGIS', databases || NOT_AVAILABLE],
    ['Horizon lointain', horizonText(sim)],
    ['Référence PVcalc', pvcalc ? `Moyenne ${pvcalc.meta.yearMin ?? '?'}${EN_DASH}${pvcalc.meta.yearMax ?? '?'}, montage ${pvcalc.meta.mountingType === 'free-standing' ? 'libre ventilé (free-standing)' : (pvcalc.meta.mountingType ?? NOT_AVAILABLE)}, technologie ${pvcalc.meta.technology ?? NOT_AVAILABLE}` : NOT_AVAILABLE],
    ['Puissance crête installée', `${number(sim.installedKWp, 2)} kWc`],
    ['Modules', `${ctx.moduleCount} × ${ctx.moduleRef}${pmax}`],
    ['Onduleur', `${ctx.inverterRef} ${EM_DASH} Pac = ${number(ctx.inverterPacW, 0)} W`],
    ['Pertes câbles DC/AC', `${number(ctx.dcDropPct, 1)} % / ${number(ctx.acDropPct, 1)} %`],
    ['Rendement onduleur', `valeur forfaitaire du moteur de calcul (${number(DEFAULT_INVERTER_EFFICIENCY_PCT, 0)} %)`],
    ['Limitation de puissance AC', `Écrêtage à ${number(ctx.inverterPacW, 0)} W`],
    ['Date de la simulation', fetched ? `${simulated} (données PVGIS extraites le ${fetched})` : simulated],
  ];
  y = drawSectionHeading(page, '1. Paramètres de la simulation', y, fonts);
  y = drawTable(page, { top: y, columns: labelValueColumns(150), header: ['Paramètre', 'Valeur'], rows, labelColumn: true, size: 9 }, fonts);

  y = drawSectionHeading(page, '2. Résultats annuels', y - 14, fonts);
  const days = isLeapYear(sim.weatherYear) ? 366 : 365;
  const variability = pvcalc && pvcalc.yearly.energyKWhPerKWp > 0 ? pvcalc.yearly.energySdKWhPerKWp / pvcalc.yearly.energyKWhPerKWp : null;
  const annualGlobInc = sim.monthly.reduce((sum, m) => sum + m.globIncKWhM2, 0);
  const results: string[][] = [
    ['Production annuelle injectée au réseau', `${number(sim.annualProductionKWh, 0)} kWh/an`],
    ['Production journalière moyenne', `${number(sim.annualProductionKWh / days, 1)} kWh/jour`],
    ['Productible spécifique', `${number(sim.specificYieldKWhPerKWp, 0)} kWh/kWc/an`],
    ['Indice de performance (PR)', `${number(sim.performanceRatioPct, 1)} %`],
    ['Énergie en sortie du champ (avant onduleur)', `${number(sim.annualArrayKWh, 0)} kWh/an`],
    ['Irradiation annuelle dans le plan des modules', `${number(annualGlobInc, 0)} kWh/m²`],
    ['Variabilité interannuelle (PVGIS, écart type)', variability !== null ? `± ${number(variability * 100, 1)} % (± ${number(variability * sim.annualProductionKWh, 0)} kWh/an)` : NOT_AVAILABLE],
  ];
  y = drawTable(page, { top: y, columns: [{ width: 300, align: 'left' }, { width: CONTENT_WIDTH - 300, align: 'right' }], header: ['Indicateur', 'Valeur'], rows: results, labelColumn: true, boldRows: [0], size: 9 }, fonts);

  y = drawSectionHeading(page, '3. Méthode de calcul', y - 14, fonts);
  const noct = ctx.moduleSpecs?.noctC ?? DEFAULT_NOCT_C;
  const gamma = ctx.moduleSpecs ? `${signedPct(ctx.moduleSpecs.tempCoeffPmaxPct, 2).replace(' %', '')} %/°C` : 'celui du module';
  const steps = [
    `Série horaire PVGIS v5.3 de l'année ${sim.weatherYear} au point GPS du site : irradiance G dans le plan des modules (directe + diffuse + réfléchie, déjà calculée par PVGIS pour l'inclinaison et l'orientation indiquées) et température ambiante Ta.`,
    `Température des cellules : Tc = Ta + (G / 800) × (NOCT ${EN_DASH} 20), avec NOCT = ${number(noct, 0)} °C.`,
    `Puissance DC du champ : P = Pc × (G / 1 000) × [1 + c × (Tc ${EN_DASH} 25)], avec Pc = ${number(sim.installedKWp, 2)} kWc et c = ${gamma}, coefficient de température de Pmax du module.`,
    `Câbles DC puis onduleur : perte Joule égale à la chute de tension de conception (${number(ctx.dcDropPct, 1)} %) au courant nominal, proportionnelle au courant de l'heure ; rendement forfaitaire de ${number(DEFAULT_INVERTER_EFFICIENCY_PCT, 0)} % ; sortie écrêtée à Pac = ${number(ctx.inverterPacW, 0)} W.`,
    `Câbles AC : ${number(ctx.acDropPct, 1)} % à Pac, proportionnels au courant injecté. Les productions mensuelles et annuelle sont les sommes des valeurs horaires ; PR = E réseau / (Pc × GlobInc).`,
  ];
  y -= 2;
  steps.forEach((step, i) => {
    y = drawParagraph(page, step, y, fonts, { size: 9, prefix: `${i + 1}.`, indent: 14 }) - 2;
  });
}

function drawPageTwo(page: PDFPage, sim: ProductionSimulation, fonts: Fonts): void {
  let y = CONTENT_TOP;
  drawCentered(page, `Rapport de simulation de production ${EM_DASH} PVGIS v5.3 (JRC) (suite)`, y - 10, 10, fonts.bold, INK_MUTED);
  y -= 22;
  y = drawSectionHeading(page, `4. Bilan mensuel (série horaire PVGIS ${sim.weatherYear})`, y, fonts);

  const hours = sim.monthly.map((m) => daysInMonth(sim.weatherYear, m.month));
  const totalDays = hours.reduce((a, b) => a + b, 0);
  const sum = (pick: (m: ProductionSimulation['monthly'][number]) => number): number => sim.monthly.reduce((total, m) => total + pick(m), 0);
  const meanTemp = sim.monthly.reduce((total, m, i) => total + m.ambientTempC * hours[i]!, 0) / totalDays;
  const rows = sim.monthly.map((m) => [
    MONTHS[m.month - 1] ?? String(m.month),
    number(m.globHorKWhM2, 1),
    number(m.globIncKWhM2, 1),
    number(m.ambientTempC, 1),
    number(m.eArrayKWh, 1),
    number(m.eGridKWh, 1),
    number(m.prPct, 1),
  ]);
  rows.push(['Année', number(sum((m) => m.globHorKWhM2), 1), number(sum((m) => m.globIncKWhM2), 1), number(meanTemp, 1), number(sim.annualArrayKWh, 1), number(sim.annualProductionKWh, 1), number(sim.performanceRatioPct, 1)]);
  const firstWidth = 85;
  const other = (CONTENT_WIDTH - firstWidth) / 6;
  y = drawTable(
    page,
    {
      top: y,
      columns: [{ width: firstWidth, align: 'left' }, ...Array.from({ length: 6 }, () => ({ width: other, align: 'right' as const }))],
      header: ['Mois', 'GlobHor\n(kWh/m²)', 'GlobInc\n(kWh/m²)', 'T amb\n(°C)', 'E champ\n(kWh)', 'E réseau\n(kWh)', 'PR\n(%)'],
      rows,
      labelColumn: true,
      boldRows: [12],
      size: 9,
    },
    fonts,
  );
  const glossary = [
    'GlobHor : irradiation globale horizontale ; GlobInc : irradiation globale dans le plan des modules ; T amb : température ambiante moyenne ;',
    `E champ : énergie en sortie du champ (avant câbles et onduleur) ; E réseau : énergie injectée au réseau ; PR = E réseau / (Pc × GlobInc).`,
  ];
  y -= 3;
  for (const line of glossary) y = drawParagraph(page, line, y, fonts, { size: 7.5, color: INK_MUTED });

  y = drawSectionHeading(page, '5. Production mensuelle injectée au réseau', y - 12, fonts);
  // Room under the chart for its caption and the (up to two-line) source line.
  const chartBottom = CARTOUCHE.y + CARTOUCHE.height + 48;
  drawMonthlyChart(page, sim.monthly.map((m) => m.eGridKWh), { x: X0, y: chartBottom, width: CONTENT_WIDTH, height: y - 6 - chartBottom }, fonts);
  const captionBottom = drawParagraph(page, `Figure 1 ${EM_DASH} Énergie injectée au réseau par mois (kWh), série horaire PVGIS ${sim.weatherYear}.`, chartBottom - 4, fonts, { size: 8, font: fonts.bold });
  drawSourceLines(page, sim, captionBottom, fonts, { size: 7.5, color: INK_MUTED });
}

function drawPageThree(page: PDFPage, sim: ProductionSimulation, ctx: ProductionReportContext, fonts: Fonts): void {
  let y = CONTENT_TOP;
  drawCentered(page, `Rapport de simulation de production ${EM_DASH} PVGIS v5.3 (JRC) (suite)`, y - 10, 10, fonts.bold, INK_MUTED);
  y -= 22;
  const pvcalc = sim.pvcalc;
  const years = pvcalc ? `${pvcalc.meta.yearMin ?? '?'}${EN_DASH}${pvcalc.meta.yearMax ?? '?'}` : null;

  y = drawSectionHeading(page, '6. Décomposition des pertes', y, fonts);
  const fromPvcalc = (value: number | undefined): string => (pvcalc && value !== undefined ? signedPct(value, 2) : NOT_AVAILABLE);
  const losses = sim.losses;
  const lossRows: string[][] = [
    ["Réflexion (angle d'incidence)", fromPvcalc(pvcalc?.losses.aoiPct), 'non modélisée'],
    ['Effets spectraux', fromPvcalc(pvcalc?.losses.spectralPct), 'non modélisés'],
    ['Température et faible éclairement', fromPvcalc(pvcalc?.losses.temperatureIrradiancePct), `${lossPct(losses.temperaturePct)} (température)`],
    ['Câbles DC', EM_DASH, lossPct(losses.dcCablePct)],
    ["Rendement de l'onduleur", EM_DASH, lossPct(losses.inverterEfficiencyPct)],
    [`Écrêtage à Pac (${number(ctx.inverterPacW, 0)} W)`, EM_DASH, lossPct(losses.clippingPct)],
    ['Câbles AC', EM_DASH, lossPct(losses.acCablePct)],
    ['Total', fromPvcalc(pvcalc?.losses.totalPct), `${lossPct(losses.totalPct)} (PR = ${number(sim.performanceRatioPct, 1)} %)`],
  ];
  y = drawTable(
    page,
    {
      top: y,
      columns: [{ width: 185, align: 'left' }, { width: 145, align: 'right' }, { width: CONTENT_WIDTH - 330, align: 'right' }],
      header: ['Poste de perte', `PVGIS PVcalc\n(moyenne ${years ?? 'pluriannuelle'})`, `Moteur de calcul\n(série horaire ${sim.weatherYear})`],
      rows: lossRows,
      labelColumn: true,
      boldRows: [7],
      size: 9,
    },
    fonts,
  );
  y = drawParagraph(
    page,
    `Pertes en % de l'énergie à l'entrée de chaque étape (elles se composent) ; « ${EM_DASH} » : hors du champ de PVcalc, interrogé sans pertes système (loss = 0). Les pertes de PVcalc portent sur sa moyenne pluriannuelle, celles du moteur sur l'année ${sim.weatherYear}.`,
    y - 3,
    fonts,
    { size: 7.5, color: INK_MUTED },
  );

  y = drawSectionHeading(page, `7. Comparaison avec PVGIS PVcalc (moyenne ${years ?? 'pluriannuelle'})`, y - 12, fonts);
  // The engine's system losses (everything after the array: cables, inverter, clipping), applied
  // to PVcalc's loss-free yield exactly as PVcalc applies its `loss` parameter.
  const systemLossPct = sim.annualArrayKWh > 0 ? (1 - sim.annualProductionKWh / sim.annualArrayKWh) * 100 : 0;
  const pvcalcAtSameLoss = pvcalc ? pvcalc.yearly.energyKWhPerKWp * (1 - systemLossPct / 100) : null;
  const gap = pvcalcAtSameLoss ? ((sim.specificYieldKWhPerKWp - pvcalcAtSameLoss) / pvcalcAtSameLoss) * 100 : null;
  const annualGlobInc = sim.monthly.reduce((total, m) => total + m.globIncKWhM2, 0);
  const comparison: string[][] = [
    ['Productible PVcalc sans pertes système', pvcalc ? `${number(pvcalc.yearly.energyKWhPerKWp, 0)} kWh/kWc/an` : NOT_AVAILABLE],
    ['Pertes système du moteur (câbles, onduleur, écrêtage)', `${number(systemLossPct, 1)} %`],
    ['Productible PVcalc à pertes système égales', pvcalcAtSameLoss !== null ? `${number(pvcalcAtSameLoss, 0)} kWh/kWc/an` : NOT_AVAILABLE],
    [`Productible du moteur de calcul (série ${sim.weatherYear})`, `${number(sim.specificYieldKWhPerKWp, 0)} kWh/kWc/an`],
    ['Écart relatif moteur / PVcalc', gap !== null ? signedPct(gap, 1) : NOT_AVAILABLE],
    [`Irradiation dans le plan : PVcalc / série ${sim.weatherYear}`, pvcalc ? `${number(pvcalc.yearly.irradiationKWhM2, 0)} / ${number(annualGlobInc, 0)} kWh/m²` : NOT_AVAILABLE],
    ['Variabilité interannuelle PVcalc (écart type annuel)', pvcalc && pvcalc.yearly.energyKWhPerKWp > 0 ? `± ${number((pvcalc.yearly.energySdKWhPerKWp / pvcalc.yearly.energyKWhPerKWp) * 100, 1)} %` : NOT_AVAILABLE],
  ];
  y = drawTable(page, { top: y, columns: [{ width: 300, align: 'left' }, { width: CONTENT_WIDTH - 300, align: 'right' }], rows: comparison, labelColumn: true, boldRows: [4], size: 9 }, fonts);
  y = drawParagraph(
    page,
    `Le moteur simule une seule année réelle (${sim.weatherYear}) heure par heure, alors que PVcalc donne une moyenne ${years ?? 'pluriannuelle'} et modélise en plus la réflexion et les effets spectraux : un écart de quelques pour cent est attendu.`,
    y - 3,
    fonts,
    { size: 7.5, color: INK_MUTED },
  );

  y = drawSectionHeading(page, '8. Hypothèses et limites', y - 12, fonts);
  const bullets = [
    `Pertes modélisées par le moteur : température des cellules, câbles DC et AC, rendement de l'onduleur (valeur forfaitaire de ${number(DEFAULT_INVERTER_EFFICIENCY_PCT, 0)} %, pas la courbe de rendement du modèle installé) et écrêtage à Pac.`,
    `Pertes non modélisées : réflexion et effets spectraux${pvcalc ? ' (chiffrés par PVcalc ci-dessus)' : ''}, salissures, ombrages proches (bâtiments, acrotères, arbres), dispersion des modules, vieillissement et indisponibilités. Le résultat vaut pour la première année d'une installation propre et sans ombrage proche.`,
    `Horizon lointain : ${horizonText(sim).charAt(0).toLowerCase()}${horizonText(sim).slice(1)}.`,
    `Année météorologique : ${sim.weatherYear} seule ; la production d'une année donnée peut s'écarter de la moyenne de la variabilité interannuelle indiquée.`,
  ];
  for (const bullet of bullets) y = drawParagraph(page, bullet, y, fonts, { size: 9, prefix: String.fromCodePoint(0x2022), indent: 12 }) - 2;

  y -= 6;
  y = drawSourceLines(page, sim, y, fonts, { size: 8.5, font: fonts.bold });
  const dates = datesLine(sim);
  if (dates) drawParagraph(page, dates, y, fonts, { size: 8.5 });
}

/**
 * Renders annex N°2, the PVGIS simulation report (see the file comment). Every figure comes from
 * `sim`; the context gives the equipment, the design drops and the cartouche.
 */
export async function renderProductionReport(sim: ProductionSimulation, ctx: ProductionReportContext): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle('Rapport de simulation de production PVGIS');
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) };
  const furniture: PageFurniture = {
    header: {
      logo: await embedLogo(doc, ctx.logo),
      stegLogo: await embedLogo(doc, ctx.stegLogo ?? null),
      installerName: ctx.installerName,
      dossierNumberText: ctx.dossierNumber?.trim() ? `Dossier n° ${ctx.dossierNumber.trim()}` : null,
    },
    cartoucheCells: [
      { label: 'Dossier n°', value: ctx.dossierNumber?.trim() || EM_DASH },
      { label: 'Date', value: formatFrenchDate(ctx.dossierDate) },
      { label: 'Installateur', value: ctx.installerName },
    ],
  };

  drawPageOne(newPage(doc, furniture, fonts), sim, ctx, fonts);
  drawPageTwo(newPage(doc, furniture, fonts), sim, fonts);
  drawPageThree(newPage(doc, furniture, fonts), sim, ctx, fonts);
  return Buffer.from(await doc.save());
}
