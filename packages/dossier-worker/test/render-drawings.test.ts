import { describe, it, expect } from 'vitest';
import {
  renderSingleLineDiagram,
  renderPanelWiringDiagram,
  renderDcBoxDiagram,
  renderAcBoxDiagram,
  type DrawingCartouche,
  type EarthingDrawingInput,
  type SingleLineInput,
} from '../src/render-drawings';
import { extractPdfContent, everythingOnPage, pageText, pdfFontNames, rawPageStreams, TIMES_FONTS, type PageContent } from './helpers/pdf-content';

const cartouche: DrawingCartouche = {
  projectTitle: 'Installation PV 2,25 kWc',
  client: 'le client',
  commune: 'Sfax',
  installerName: 'SolarPro Tunisie',
  anmeCode: 'AN-123',
  revision: 'A',
  date: '2026-10-22',
  dossierNumber: '434 - 303',
  logo: null,
};

const earthing: EarthingDrawingInput = { mode: 'DEDICATED_ROD', mainMm2: 16, frameMm2: 6, toPitMm2: 16, targetOhm: 30 };
const dcCable = { ref: 'H1Z2Z2-K', sectionMm2: 4, lengthM: 25 };
const acCable = { ref: 'U1000 R2V', sectionMm2: 6, lengthM: 15 };
const dcSwitch = { label: 'Interrupteur-sectionneur DC', ref: 'Q1', lines: ['Un 1000 V', 'In 32 A', '2 pôles'] };
const dcSpd = { label: 'Parafoudre DC type 2', ref: 'SPD1', lines: ['Uc 1000 V', 'Up 3,8 kV', 'In 20 kA'] };
const dcFuse = { label: 'Fusible gPV', ref: 'F1', lines: ['16 A / 1000 V'] };
const acBreaker = { label: 'Disjoncteur différentiel AC', ref: 'Q2', lines: ['In 16 A courbe C', '30 mA type A', '2 pôles'] };
const acSpd = { label: 'Parafoudre AC type 2', ref: 'SPD2', lines: ['Uc 275 V', 'Up 1,5 kV', 'In 20 kA'] };

const singleLine: SingleLineInput = {
  pvField: { moduleRef: 'AE450MC-144', moduleCount: 5, strings: 1, modulesPerString: 5, stringVocTminV: 281.4, iscA: 11.3 },
  dcCable,
  dcSwitch,
  dcSpd,
  dcFuse,
  inverter: { label: 'DEYE SUN-2.2K-G04P1-EU-AM1', ref: 'INV1', lines: ['Pac 2,2 kW', '2 MPPT, monophasé, accepté STEG'] },
  acCable,
  acBreaker,
  acSpd,
  agcp: { calibreA: '30/32' },
  earthing,
  cartouche,
};

/** The page's drawn texts joined by single spaces, so a label wrapped over several lines still matches. */
function flat(page: PageContent): string {
  return pageText(page).replace(/\s+/g, ' ');
}

async function onePage(buffer: Buffer): Promise<PageContent> {
  const pages = await extractPdfContent(buffer);
  expect(pages).toHaveLength(1);
  return pages[0]!;
}

const isGreen = (stroke: number[] | null): boolean => stroke !== null && stroke[1]! > stroke[0]! && stroke[1]! > stroke[2]!;
const isRed = (stroke: number[] | null): boolean => stroke !== null && stroke[0]! > 0.6 && stroke[1]! < 0.2 && stroke[2]! < 0.2;

async function hasDashedPaths(buffer: Buffer): Promise<boolean> {
  return (await rawPageStreams(buffer)).some((stream) => /\[\s*[\d.]+\s+[\d.]+\s*\]\s*[\d.]+\s+d\b/.test(stream));
}

describe('renderSingleLineDiagram', () => {
  it('is one A4-landscape page with every device, its rating and the earthing', async () => {
    const buffer = await renderSingleLineDiagram(singleLine);
    const page = await onePage(buffer);
    expect(page.width).toBeCloseTo(841.89, 1);
    const text = flat(page);
    for (const expected of [
      'Schéma unifilaire',
      'Compteur bidirectionnel STEG',
      'Disjoncteur de branchement STEG (AGCP) 30/32 A',
      '30 mA type A',
      'Coffret DC',
      'Coffret AC',
      'Tableau électrique existant du client',
      'TT',
      'Piquet de terre',
      'H1Z2Z2-K 2 × 1 × 4 mm² — 25 m',
      'U1000 R2V 3 × 6 mm² — 15 m',
      'Q1',
      'F1',
      'SPD1',
      'Q2',
      'SPD2',
      'kWh',
      '2 MPPT, monophasé, accepté STEG',
      'sans échelle',
      'AN-123',
      'R max. 30 ohms',
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(page.paths.some((p) => isGreen(p.stroke))).toBe(true);
    expect(await hasDashedPaths(buffer)).toBe(true);
    expect(everythingOnPage(page)).toBe(true);
  });

  it('draws no fuse when there is none', async () => {
    const page = await onePage(await renderSingleLineDiagram({ ...singleLine, dcFuse: null }));
    expect(flat(page)).not.toContain('F1');
    expect(flat(page)).not.toContain('Fusible');
  });

  it('shows the building earth instead of a rod', async () => {
    const page = await onePage(await renderSingleLineDiagram({ ...singleLine, earthing: { ...earthing, mode: 'BUILDING_EARTH' } }));
    expect(flat(page)).toContain('Terre existante du bâtiment');
    expect(flat(page)).not.toContain('Piquet de terre');
  });

  it('asks for the AGCP rating when the subscribed power is off the ladder', async () => {
    const page = await onePage(await renderSingleLineDiagram({ ...singleLine, agcp: { calibreA: null } }));
    expect(flat(page)).toContain('calibre à relever sur le disjoncteur de branchement');
  });

  it('writes "1 chaîne", never "chaîne(s)"', async () => {
    const page = await onePage(await renderSingleLineDiagram(singleLine));
    expect(flat(page)).toContain('1 chaîne de 5 modules');
    expect(flat(page)).not.toContain('chaîne(s)');
    const many = await onePage(await renderSingleLineDiagram({ ...singleLine, pvField: { ...singleLine.pvField, strings: 2, moduleCount: 10 } }));
    expect(flat(many)).toContain('2 chaînes de 5 modules');
  });

  it('never prints text under 7 pt and uses only the Times fonts', async () => {
    const buffer = await renderSingleLineDiagram(singleLine);
    const page = await onePage(buffer);
    for (const text of page.texts) expect(text.size, text.text).toBeGreaterThanOrEqual(7);
    for (const font of await pdfFontNames(buffer)) expect(TIMES_FONTS).toContain(font);
  });
});

describe('renderPanelWiringDiagram', () => {
  const input = { strings: [{ modules: 5 }], moduleRef: 'AE450MC-144', dcCable, frameMm2: 6, toPitMm2: 16, earthing, cartouche };

  it('draws a 1 × 5 string with its polarity and PE conductors', async () => {
    const buffer = await renderPanelWiringDiagram(input);
    const page = await onePage(buffer);
    const text = flat(page);
    for (const id of ['P1', 'P2', 'P3', 'P4', 'P5']) expect(text).toContain(id);
    expect(text).toContain('Coffret DC');
    expect(text).toContain('1 × 4 mm²');
    expect(text).toContain('1 × 6 mm²');
    expect(page.paths.some((p) => isRed(p.stroke))).toBe(true);
    expect(page.paths.some((p) => isGreen(p.stroke))).toBe(true);
    expect(await hasDashedPaths(buffer)).toBe(true);
    expect(everythingOnPage(page)).toBe(true);
  });

  it('collapses a 20-module string to P1-P3, an ellipsis and the last two', async () => {
    const page = await onePage(await renderPanelWiringDiagram({ ...input, strings: [{ modules: 20 }] }));
    const labels = page.texts.map((t) => t.text);
    expect(labels).toContain('…');
    expect(labels).toContain('P20');
    expect(labels).toContain('P19');
    expect(labels).not.toContain('P10');
    expect(everythingOnPage(page)).toBe(true);
  });

  it('keeps many strings on the page', async () => {
    const page = await onePage(await renderPanelWiringDiagram({ ...input, strings: Array.from({ length: 9 }, () => ({ modules: 6 })) }));
    expect(flat(page)).toContain('Chaînes 3 à 8 identiques');
    expect(everythingOnPage(page)).toBe(true);
  });
});

describe('renderDcBoxDiagram', () => {
  const input = { strings: 2, dcSwitch, dcSpd, dcFuse, dcCable, earthing, cartouche };

  it('shows the switch, the SPD, the fuses and the output cable', async () => {
    const page = await onePage(await renderDcBoxDiagram(input));
    const text = flat(page);
    expect(text).toContain('Coffret DC');
    expect(text).toContain('Un 1000 V');
    expect(text).toContain('Uc 1000 V');
    expect(text).toContain('Up 3,8 kV');
    expect(text).toContain('F1');
    expect(text).toContain('Chaîne 2 (+)');
    expect(text).toContain('Vers onduleur — H1Z2Z2-K 2 × 1 × 4 mm² — 25 m');
    expect(everythingOnPage(page)).toBe(true);
  });

  it('has no fuse text without a fuse', async () => {
    const page = await onePage(await renderDcBoxDiagram({ ...input, dcFuse: null }));
    expect(flat(page)).not.toContain('F1');
    expect(flat(page)).not.toContain('Fusible gPV 16 A');
  });

  it('keeps five or more strings on the page', async () => {
    const page = await onePage(await renderDcBoxDiagram({ ...input, strings: 9 }));
    expect(flat(page)).toContain('4 autres chaînes identiques');
    expect(everythingOnPage(page)).toBe(true);
  });
});

describe('renderAcBoxDiagram', () => {
  const input = { acBreaker, acSpd, acCable, earthing, agcp: { calibreA: '30/32' }, cartouche };

  it('shows the 30 mA breaker, the SPD and the L / N / PE conductors', async () => {
    const page = await onePage(await renderAcBoxDiagram(input));
    const text = flat(page);
    expect(text).toContain('30 mA type A');
    expect(text).toContain("Vers point d'injection");
    expect(text).toContain("Depuis l'onduleur — L / N / PE");
    expect(text).toContain('Up 1,5 kV');
    const strokes = page.paths.map((p) => p.stroke);
    expect(strokes.some((s) => s && Math.abs(s[0]! - 0.45) < 0.01 && Math.abs(s[2]! - 0.1) < 0.01)).toBe(true); // brown phase
    expect(strokes.some((s) => s && Math.abs(s[2]! - 0.8) < 0.01 && s[0]! < 0.2)).toBe(true); // blue neutral
    expect(strokes.some(isGreen)).toBe(true);
    expect(everythingOnPage(page)).toBe(true);
  });
});
