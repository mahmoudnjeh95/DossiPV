import { describe, it, expect } from 'vitest';
import { renderDrawingPages, type DrawingsInput } from '../src/render-drawings';
import { extractPdfContent, findText, pageText, everythingOnPage, pdfFontNames, TIMES_FONTS, type PageContent, type DrawnText } from './helpers/pdf-content';

const singleInverterInput: DrawingsInput = {
  moduleLabel: 'LONGi LR7-72HGD-620M',
  inverters: [
    {
      inverterLabel: 'Sofar 1-4KTL2-G3',
      pacW: 3000,
      mppts: [{ stringsInParallel: 1, modulesPerString: 5 }],
    },
  ],
  dcSwitchLabel: 'ZJ BENY BB1H-63',
  dcSpdLabel: 'Generic DC-SPD-1',
  acSpdLabel: 'Generic AC-SPD-1',
  acBreakerLabel: 'Generic AC-BRK-20',
  dcRun: { sectionMm2: 6, lengthM: 25 },
  acRun: { sectionMm2: 6, lengthM: 15 },
  earthRodCount: 3,
  earthingMode: 'DEDICATED_ROD',
};

const threeInverterInput: DrawingsInput = {
  ...singleInverterInput,
  inverters: [
    { inverterLabel: 'Sofar 1-4KTL2-G3', pacW: 3000, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] },
    { inverterLabel: 'Huawei SUN2000-5KTL-L1 with a deliberately very long commercial model designation', pacW: 5000, mppts: [{ stringsInParallel: 2, modulesPerString: 6 }] },
    { inverterLabel: 'Growatt MIN 3000TL-X', pacW: 3000, mppts: [{ stringsInParallel: 1, modulesPerString: 6 }] },
  ],
};

function mustFind(page: PageContent, needle: string | RegExp): DrawnText {
  const found = findText(page, needle);
  expect(found, `text ${String(needle)} not drawn`).toBeDefined();
  return found!;
}

/** Closed axis-aligned rectangles drawn on the page (the label boxes). */
function boxes(page: PageContent): { x: number; y: number; right: number; top: number }[] {
  return page.paths
    .filter((p) => p.closed && p.points.length === 4)
    .map((p) => {
      const xs = p.points.map((pt) => pt.x);
      const ys = p.points.map((pt) => pt.y);
      return { x: Math.min(...xs), y: Math.min(...ys), right: Math.max(...xs), top: Math.max(...ys) };
    });
}

function containingBox(page: PageContent, text: DrawnText): { x: number; y: number; right: number; top: number } | undefined {
  return boxes(page).find((b) => text.x >= b.x && text.x <= b.right && text.y >= b.y && text.y + text.size * 0.7 <= b.top);
}

function insideSomeBox(page: PageContent, text: DrawnText): boolean {
  return containingBox(page, text) !== undefined;
}

describe('renderDrawingPages', () => {
  it('uses only the Times fonts (one font family across the dossier)', async () => {
    const fonts = await pdfFontNames(await renderDrawingPages(threeInverterInput));
    expect(fonts.size).toBeGreaterThan(0);
    for (const font of fonts) expect(TIMES_FONTS).toContain(font);
  });

  it('words the earthing line from earthingMode, not from the rod count', async () => {
    const textOf = async (input: DrawingsInput): Promise<string> =>
      (await extractPdfContent(await renderDrawingPages(input))).map((page) => pageText(page)).join(' ');
    expect(await textOf(singleInverterInput)).toContain('Mise à la terre : 3 piquet(s)');
    const building = await textOf({ ...singleInverterInput, earthingMode: 'BUILDING_EARTH', earthRodCount: 1 });
    expect(building).toContain('Mise à la terre : terre existante du bâtiment');
    expect(building).not.toContain('piquet');
  });

  it('produces a 2-page PDF (single-line + unifilar) for a single-inverter project', async () => {
    const pages = await extractPdfContent(await renderDrawingPages(singleInverterInput));
    expect(pages).toHaveLength(2);
    expect(pageText(pages[0]!)).toContain('Schéma unifilaire simplifié');
    expect(pageText(pages[1]!)).toContain('Schéma de câblage détaillé');
  });

  it('single-line diagram follows the spec slot order: PV array → DC protections → inverter → AC protections → STEG', async () => {
    const [singleLine] = await extractPdfContent(await renderDrawingPages(singleInverterInput));
    const order = ['Champ PV', 'Protections DC', 'Onduleur 1', 'Protections AC', "Point d'injection STEG"].map((label) => mustFind(singleLine!, label).x);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    }
  });

  it('unifilar diagram puts the DC protections BEFORE the inverter and the AC protections after it', async () => {
    const [, unifilar] = await extractPdfContent(await renderDrawingPages(singleInverterInput));
    const labels = ['Champ PV', /^Interrupteur-/, 'Parafoudre DC', 'Onduleur 1', 'Disjoncteur AC', 'Parafoudre AC', 'Compteur STEG'];
    const xs = labels.map((label) => mustFind(unifilar!, label).x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]!, `${labels[i]} should be right of ${labels[i - 1]}`).toBeGreaterThan(xs[i - 1]!);
    }
    // The equipment brand/model is shown in the matching box.
    expect(pageText(unifilar!)).toContain('ZJ BENY BB1H-63');
    expect(pageText(unifilar!)).toContain('Generic AC-BRK-20');
  });

  it('draws 3 inverters as parallel branches stacked in ONE column between the DC and AC protections, not chained in series', async () => {
    const pages = await extractPdfContent(await renderDrawingPages(threeInverterInput));
    for (const [page, dcLabel, acLabel] of [
      [pages[0]!, 'Protections DC', 'Protections AC'],
      [pages[1]!, 'Parafoudre DC', 'Disjoncteur AC'],
    ] as const) {
      const inverters = [1, 2, 3].map((n) => mustFind(page, `Onduleur ${n}`));
      const inverterBoxes = inverters.map((t) => containingBox(page, t)!);
      expect(inverterBoxes.every(Boolean)).toBe(true);
      const columnXs = inverterBoxes.map((b) => b.x);
      expect(Math.max(...columnXs) - Math.min(...columnXs)).toBeLessThan(0.01); // same column
      // Stacked top to bottom, and not overlapping.
      expect(inverterBoxes[0]!.y).toBeGreaterThanOrEqual(inverterBoxes[1]!.top);
      expect(inverterBoxes[1]!.y).toBeGreaterThanOrEqual(inverterBoxes[2]!.top);
      for (const inv of inverters) {
        expect(inv.x).toBeGreaterThan(mustFind(page, dcLabel).x);
        expect(inv.x).toBeLessThan(mustFind(page, acLabel).x);
      }
      // A vertical bus line on each side of the stack spans all three branches.
      const verticalBuses = page.paths.filter((p) => !p.closed && p.points.length === 2 && Math.abs(p.points[0]!.x - p.points[1]!.x) < 0.01);
      expect(verticalBuses.length).toBeGreaterThanOrEqual(2);
      expect(everythingOnPage(page)).toBe(true);
    }
  });

  it("labels each inverter with ITS OWN brand/model (mixed-model project)", async () => {
    const pages = await extractPdfContent(await renderDrawingPages(threeInverterInput));
    for (const page of pages) {
      const text = pageText(page).replace(/\n/g, ' ');
      expect(text).toContain('Sofar 1-4KTL2-G3');
      expect(text).toContain('Growatt MIN 3000TL-X');
      expect(text).toContain('Huawei');
    }
  });

  it('keeps every box label inside its box, even long ones (no text spilling below the box)', async () => {
    const pages = await extractPdfContent(await renderDrawingPages(threeInverterInput));
    for (const page of pages) {
      const boxLabels = page.texts.filter((t) => !t.text.startsWith('Schéma') && !t.text.startsWith('Liaison') && !t.text.startsWith('Mise à la terre'));
      expect(boxLabels.length).toBeGreaterThan(10);
      for (const label of boxLabels) {
        expect(insideSomeBox(page, label), `"${label.text}" is outside every box`).toBe(true);
      }
    }
  });

  it('does not throw on an Arabic or non-WinAnsi equipment brand/model', async () => {
    const pages = await extractPdfContent(
      await renderDrawingPages({
        ...singleInverterInput,
        moduleLabel: 'شمس ğ Module',
        inverters: [{ ...singleInverterInput.inverters[0]!, inverterLabel: 'Łódź Inverter حبيب' }],
        dcSwitchLabel: `ZJ${String.fromCodePoint(0x202f)}BENY`,
      }),
    );
    expect(pageText(pages[1]!).replace(/\n/g, ' ')).toContain('Lódz Inverter ????');
  });
});
