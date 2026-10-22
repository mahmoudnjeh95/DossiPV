import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { columnRects, drawHighlights, highlightInverterDatasheet, highlightModuleDatasheet, rowRect } from '../src/highlight';
import { extractTextBoxes, type TextBox } from '../src/pdf-locate';
import { extractPdfContent, type DrawnPath } from './helpers/pdf-content';
import {
  INVERTER_MODELS,
  INVERTER_ROWS,
  MERGED_CELL_X,
  MERGED_ROWS,
  MODULE_POWERS,
  SYNTHETIC_MODULE,
  imageOnlyPdf,
  inverterRowY,
  syntheticInverterDatasheet,
  syntheticModuleDatasheet,
} from './helpers/synthetic-datasheet';

const AMBER = [1, 0.82, 0];

async function blankPdf(size: [number, number], rotation = 0): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage(size).setRotation(degrees(rotation));
  doc.addPage(size);
  return Buffer.from(await doc.save());
}

function bounds(points: { x: number; y: number }[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe('rowRect', () => {
  it('spans the page items horizontally and the hits ±2 pt vertically', () => {
    const page: TextBox[] = [
      { text: 'Marque', x: 60, y: 780, width: 40, height: 10 },
      { text: 'DEYE', x: 60, y: 600, width: 30, height: 10 },
      { text: 'SUN', x: 160, y: 600, width: 50, height: 10 },
      { text: '31/12/2028', x: 460, y: 600, width: 50, height: 10 },
    ];
    expect(rowRect(page, [page[2]!])).toEqual({ x: 60, y: 598, width: 450, height: 14 });
  });
});

describe('drawHighlights', () => {
  it('draws filled amber rectangles on the given page only', async () => {
    const out = await drawHighlights(await blankPdf([595, 842]), 1, [{ x: 50, y: 100, width: 200, height: 14 }]);
    const pages = await extractPdfContent(out);
    expect(pages[0]!.paths).toHaveLength(0);
    const amber = pages[1]!.paths.filter((p) => JSON.stringify(p.fill) === JSON.stringify(AMBER));
    expect(amber).toHaveLength(1);
    expect(bounds(amber[0]!.points)).toEqual({ minX: 50, maxX: 250, minY: 100, maxY: 114 });
  });

  it('uses opacity 0.4 and the Multiply blend mode', async () => {
    const out = await drawHighlights(await blankPdf([595, 842]), 0, [{ x: 0, y: 0, width: 10, height: 10 }]);
    const doc = await PDFDocument.load(out);
    const states = doc.getPage(0).node.Resources()!.toString();
    expect(states).toMatch(/\/ca 0\.4/);
    expect(states).toMatch(/\/BM \/Multiply/);
  });

  it('maps a displayed rectangle back to user space on a rotated page', async () => {
    // 400 × 600 user page shown at /Rotate 90 as 600 × 400: displayed (X, Y) is user (400 − Y, X).
    const out = await drawHighlights(await blankPdf([400, 600], 90), 0, [{ x: 50, y: 290, width: 200, height: 14 }]);
    const amber = (await extractPdfContent(out))[0]!.paths.filter((p) => JSON.stringify(p.fill) === JSON.stringify(AMBER));
    const b = bounds(amber[0]!.points);
    expect(b.minX).toBeCloseTo(96, 5);
    expect(b.maxX).toBeCloseTo(110, 5);
    expect(b.minY).toBeCloseTo(50, 5);
    expect(b.maxY).toBeCloseTo(250, 5);
  });
});

function amberPaths(paths: DrawnPath[]): DrawnPath[] {
  return paths.filter((p) => JSON.stringify(p.fill) === JSON.stringify(AMBER));
}

function centre(path: DrawnPath): { x: number; y: number } {
  const b = bounds(path.points);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** A column's band, as the brief defines it: half-way to the neighbouring headers. */
function band(left: TextBox | undefined, header: TextBox, right: TextBox | undefined): { min: number; max: number } {
  const leftGap = left ? header.x - (left.x + left.width) : undefined;
  const rightGap = right ? right.x - (header.x + header.width) : undefined;
  return { min: header.x - (leftGap ?? rightGap ?? 0) / 2, max: header.x + header.width + (rightGap ?? leftGap ?? 0) / 2 };
}

describe('columnRects', () => {
  const header: TextBox = { text: 'B', x: 200, y: 700, width: 40, height: 10 };
  const page: TextBox[] = [
    { text: 'Model', x: 50, y: 700, width: 30, height: 10 },
    { text: 'A', x: 100, y: 700, width: 40, height: 10 },
    header,
    { text: 'C', x: 300, y: 700, width: 40, height: 10 },
    { text: 'Title', x: 200, y: 780, width: 40, height: 10 },
    { text: 'Label', x: 50, y: 650, width: 100, height: 10 },
    { text: 'a1', x: 110, y: 650, width: 20, height: 10 },
    { text: 'b1', x: 210, y: 650, width: 20, height: 10 },
    { text: 'b2 wide', x: 175, y: 630, width: 80, height: 10 },
    { text: 'c1', x: 310, y: 650, width: 20, height: 10 },
    { text: ' ', x: 215, y: 610, width: 5, height: 10 },
  ];

  it('gives one rectangle per item below the header whose centre is in the widened band, and the header', () => {
    // Band: 200 − (200 − 140) / 2 = 170 to 240 + (300 − 240) / 2 = 270.
    const rects = columnRects(page, [header]);
    expect(rects.map((r) => r.x + r.width / 2)).toEqual([220, 220, 215]);
    expect(rects).toHaveLength(3);
    expect(rects.every((r) => r.y < 700 + 10 + 3)).toBe(true);
  });

  it('widens the edge column by the gap on its only side', () => {
    const rects = columnRects(page, [page[3]!]);
    expect(rects.map((r) => r.x + r.width / 2)).toEqual([320, 320]);
  });
});

describe('highlightInverterDatasheet', () => {
  it("highlights only the chosen model's column", async () => {
    const pdf = await syntheticInverterDatasheet('columns');
    const boxes = (await extractTextBoxes(pdf))[0]!;
    const [a, b, c] = INVERTER_MODELS.map((model) => boxes.find((box) => box.text === model)!);
    const bBand = band(a, b!, c);

    const result = await highlightInverterDatasheet(pdf, INVERTER_MODELS[1]);

    expect(result.highlighted).toBe(true);
    const amber = amberPaths((await extractPdfContent(result.pdf))[0]!.paths);
    for (const path of amber) {
      expect(centre(path).x).toBeGreaterThan(bBand.min);
      expect(centre(path).x).toBeLessThan(bBand.max);
    }
    // The header and its eight values.
    expect(amber).toHaveLength(1 + INVERTER_ROWS.length);
  });

  it('falls back to rows for a single-model sheet', async () => {
    const result = await highlightInverterDatasheet(await syntheticInverterDatasheet('single'), INVERTER_MODELS[1]);

    expect(result.highlighted).toBe(true);
    const amber = amberPaths((await extractPdfContent(result.pdf))[0]!.paths);
    // The six used rows (Vdc max, MPPT range, Idc max, Isc, Pac, Iac max), not weight or IP.
    expect(amber).toHaveLength(6);
    const rowYs = amber.map((path) => centre(path).y).sort((p, q) => q - p);
    rowYs.forEach((y, i) => {
      expect(y).toBeGreaterThan(inverterRowY(i));
      expect(y).toBeLessThan(inverterRowY(i) + 9);
    });
    for (const path of amber) expect(bounds(path.points).maxX - bounds(path.points).minX).toBeGreaterThan(250);
  });

  it('matches a model printed on two lines and keeps the merged cells shared by every column', async () => {
    const pdf = await syntheticInverterDatasheet('stacked');

    const result = await highlightInverterDatasheet(pdf, `${INVERTER_MODELS[0]}P1-EU`);

    expect(result.highlighted).toBe(true);
    const amber = amberPaths((await extractPdfContent(result.pdf))[0]!.paths);
    // Two header lines, the merged values centred on the table, then the model's own values; not
    // the lone mark over the last column.
    expect(amber).toHaveLength(2 + INVERTER_ROWS.length);
    expect(amber.filter((path) => Math.abs(centre(path).x - MERGED_CELL_X) < 1)).toHaveLength(MERGED_ROWS);
    expect(amber.filter((path) => Math.abs(centre(path).x - 250) < 1)).toHaveLength(2 + INVERTER_ROWS.length - MERGED_ROWS);
  });

  it('skips the highlight on a text-less page with a warning', async () => {
    const scan = await imageOnlyPdf();
    const inverter = await highlightInverterDatasheet(scan, INVERTER_MODELS[1]);
    const module = await highlightModuleDatasheet(scan, SYNTHETIC_MODULE);

    expect(inverter).toEqual({ pdf: scan, highlighted: false });
    expect(module).toEqual({ pdf: scan, highlighted: false });
  });

  it("highlights a table of dissimilar model names in the model's column only, not on another page", async () => {
    const models = ['GW3000-NS', 'SG5.0RS', 'X1-6.0K'];
    const pdf = await syntheticInverterDatasheet('columns', { models, unrelatedPage: true });
    const boxes = (await extractTextBoxes(pdf))[0]!;
    const [a, b, c] = models.map((model) => boxes.find((box) => box.text === model)!);
    const bBand = band(a, b!, c);

    const result = await highlightInverterDatasheet(pdf, 'SG5.0RS');

    expect(result.highlighted).toBe(true);
    const [first, second] = await extractPdfContent(result.pdf);
    const amber = amberPaths(first!.paths);
    expect(amber).toHaveLength(1 + INVERTER_ROWS.length);
    for (const path of amber) {
      expect(centre(path).x).toBeGreaterThan(bBand.min);
      expect(centre(path).x).toBeLessThan(bBand.max);
    }
    expect(amberPaths(second!.paths)).toHaveLength(0);
  });

  it('highlights the used rows only on the page naming a single model', async () => {
    const result = await highlightInverterDatasheet(await syntheticInverterDatasheet('single', { unrelatedPage: true }), INVERTER_MODELS[1]);

    const [first, second] = await extractPdfContent(result.pdf);
    expect(amberPaths(first!.paths)).toHaveLength(6);
    expect(amberPaths(second!.paths)).toHaveLength(0);
  });

  it('leaves a datasheet that does not name the model unchanged', async () => {
    const pdf = await syntheticInverterDatasheet('columns');
    expect(await highlightInverterDatasheet(pdf, 'SUN-12K-SG04LP3')).toEqual({ pdf, highlighted: false });
  });
});

describe('highlightModuleDatasheet', () => {
  it("highlights the module's five values", async () => {
    const pdf = await syntheticModuleDatasheet();
    const boxes = (await extractTextBoxes(pdf))[0]!;
    const [p440, p445, p450] = MODULE_POWERS.map((power) => boxes.find((box) => box.text === power)!);
    const column = band(p445, p450!, undefined);

    const result = await highlightModuleDatasheet(pdf, SYNTHETIC_MODULE);

    expect(result.highlighted).toBe(true);
    expect(p440).toBeDefined();
    const amber = amberPaths((await extractPdfContent(result.pdf))[0]!.paths);
    // 450, 41,40, 10.87, 50.00, 11.54 — not the efficiency, not the 445 W decoy, not the 50 mm
    // frame height or the 450 N load in the same column.
    expect(amber).toHaveLength(5);
    for (const path of amber) {
      expect(centre(path).x).toBeGreaterThan(column.min);
      expect(centre(path).x).toBeLessThan(column.max);
    }
  });
});
