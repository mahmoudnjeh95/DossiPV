import { describe, it, expect, beforeAll } from 'vitest';
import type { PvgisPvcalcReference } from '@dossipv/pvgis-client';
import { renderProductionReport, type ProductionReportContext } from '../src/render-production-report';
import type { ProductionSimulation } from '../src/run-simulation';
import { everythingOnPage, extractPdfContent, findText, pageText, pdfFontNames, TIMES_FONTS, type PageContent } from './helpers/pdf-content';

const E_GRID = [404.1, 473.3, 473.6, 490.1, 555.4, 557.6, 593.9, 580.0, 434.5, 472.0, 394.4, 419.6];
const GLOB_INC = [145, 179, 178, 184, 213, 211, 230, 226, 163, 177, 143, 149];

const PVCALC: PvgisPvcalcReference = {
  meta: { radiationDb: 'PVGIS-SARAH3', meteoDb: 'ERA5', elevationM: 4, useHorizon: true, horizonSource: 'DEM-calculated', yearMin: 2005, yearMax: 2023, mountingType: 'free-standing', technology: 'c-Si' },
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, energyKWhPerKWp: 160, dailyEnergyKWhPerKWp: 5.3, irradiationKWhM2: 180, energySdKWhPerKWp: 8 })),
  yearly: { energyKWhPerKWp: 1974.65, dailyEnergyKWhPerKWp: 5.41, irradiationKWhM2: 2176.08, energySdKWhPerKWp: 29.88 },
  losses: { aoiPct: -2.57, spectralPct: 0.47, temperatureIrradiancePct: -7.3, totalPct: -9.26 },
};

const annual = E_GRID.reduce((a, b) => a + b, 0);
const SIMULATION: ProductionSimulation = {
  lat: 34.74,
  lon: 10.76,
  tiltDeg: 30,
  azimuthDeg: 0,
  weatherYear: 2020,
  installedKWp: 3.1,
  annualProductionKWh: annual,
  annualArrayKWh: 6429.48,
  specificYieldKWhPerKWp: annual / 3.1,
  performanceRatioPct: (annual / (3.1 * GLOB_INC.reduce((a, b) => a + b, 0))) * 100,
  monthly: E_GRID.map((eGridKWh, i) => ({
    month: i + 1,
    globHorKWhM2: GLOB_INC[i]! * 0.85,
    globIncKWhM2: GLOB_INC[i]!,
    ambientTempC: 12 + i,
    eArrayKWh: eGridKWh * 1.1,
    eGridKWh,
    prPct: (eGridKWh / (3.1 * GLOB_INC[i]!)) * 100,
  })),
  pvgis: { radiationDb: 'PVGIS-SARAH3', meteoDb: 'ERA5', elevationM: 4, useHorizon: true, horizonSource: 'DEM-calculated', fetchedAt: '2026-10-21T08:00:00.000Z' },
  simulatedAt: '2026-10-22T15:25:00.000Z',
  annualNominalKWh: 3.1 * 2198,
  losses: { temperaturePct: 5.7, dcCablePct: 0.9, inverterEfficiencyPct: 3, clippingPct: 4.7, acCablePct: 0.6, totalPct: 14.2 },
  pvcalc: PVCALC,
};

const CONTEXT: ProductionReportContext = {
  moduleRef: 'TESTSOLAR TS-620M',
  moduleCount: 5,
  inverterRef: 'TESTINV 2K2',
  inverterPacW: 2200,
  dcDropPct: 1.5,
  acDropPct: 1,
  dossierNumber: '434 - 303',
  dossierDate: '2026-10-22',
  installerName: 'TEST INSTALLATEUR SARL',
  logo: null,
  moduleSpecs: { pmaxW: 620, tempCoeffPmaxPct: -0.28, noctC: null },
};

/** The bars of the monthly chart: closed filled paths in the chart's blue. */
function barPaths(page: PageContent): PageContent['paths'] {
  return page.paths.filter((p) => p.fill !== null && Math.abs(p.fill[0]! - 0.122) < 0.01 && Math.abs(p.fill[2]! - 0.604) < 0.01);
}

const height = (path: PageContent['paths'][number]): number => Math.max(...path.points.map((p) => p.y)) - Math.min(...path.points.map((p) => p.y));

describe('renderProductionReport', () => {
  let pages: PageContent[];
  let pdf: Buffer;

  beforeAll(async () => {
    pdf = await renderProductionReport(SIMULATION, CONTEXT);
    pages = await extractPdfContent(pdf);
  });

  it('renders three A4 portrait pages in Times', async () => {
    expect(pages).toHaveLength(3);
    for (const page of pages) {
      expect(page.width).toBeCloseTo(595.28, 1);
      expect(page.height).toBeCloseTo(841.89, 1);
    }
    expect(await pdfFontNames(pdf)).toEqual(TIMES_FONTS);
  });

  it('opens with the PVGIS title, the parameters and the formatted annual production', () => {
    const text = pageText(pages[0]!);
    expect(text).toContain('Rapport de simulation de production — PVGIS v5.3 (JRC)');
    expect(text).toContain('PVGIS v5.3, série horaire 2020');
    expect(text).toContain('34,74000° N, 10,76000° E');
    expect(text).toContain('3,10 kWc');
    expect(text).toContain('5 × TESTSOLAR TS-620M');
    expect(text).toContain('TESTINV 2K2');
    expect(text).toContain('Pertes câbles DC/AC');
    expect(text).toContain('1,5 % / 1,0 %');
    expect(text).toContain('Rendement onduleur');
    expect(text).toContain('valeur forfaitaire du moteur de calcul (97 %)');
    expect(text).toContain('Écrêtage à 2 200 W');
    expect(text).toContain('PVGIS-SARAH3');
    expect(text).toContain('2005–2023');
    // The annual figure in fr-FR, its narrow no-break space drawn as a plain space.
    const annualText = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(annual).replace(String.fromCodePoint(0x202f), ' ');
    expect(text).toContain(`${annualText} kWh/an`);
    expect(text).toContain('Énergie en sortie du champ (avant onduleur)');
    expect(text).toContain('6 429 kWh/an');
    expect(text).toContain('Méthode de calcul');
  });

  it('gives the monthly table with a yearly total, and a 12-bar chart scaled to the values', () => {
    const page = pages[1]!;
    const text = pageText(page);
    for (const header of ['Mois', 'GlobHor', 'GlobInc', 'T amb', 'E champ', 'E réseau', 'PR']) expect(text).toContain(header);
    expect(text).toContain('Janvier');
    expect(text).toContain('Décembre');
    expect(text).toContain('Année');
    expect(text).toContain('404,1');

    const bars = barPaths(page);
    expect(bars).toHaveLength(12);
    const heights = bars.map(height);
    const tallest = heights.indexOf(Math.max(...heights));
    expect(tallest).toBe(E_GRID.indexOf(Math.max(...E_GRID)));
    for (let i = 0; i < 12; i += 1) expect(heights[i]! / heights[tallest]!).toBeCloseTo(E_GRID[i]! / E_GRID[tallest]!, 2);
    // Bars run left to right from January.
    const lefts = bars.map((bar) => Math.min(...bar.points.map((p) => p.x)));
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
    expect(text).toContain('Énergie injectée (kWh)');
    expect(text).toContain('Déc.');
  });

  it('itemises the losses from PVcalc and from the engine, and compares the yields', () => {
    const text = pageText(pages[2]!);
    expect(text).toContain('Décomposition des pertes');
    expect(text).toContain('–2,57 %'); // PVcalc angle of incidence
    expect(text).toContain('+0,47 %'); // spectral
    expect(text).toContain('–7,30 %'); // temperature and low irradiance
    expect(text).toContain('–4,7 %'); // engine clipping
    expect(text).toContain('Comparaison avec PVGIS PVcalc (moyenne 2005–2023)');
    expect(text).toContain('1 975 kWh/kWc/an'); // PVcalc E_y without system loss
    expect(text).toContain('Variabilité interannuelle');
    expect(text).toContain('Hypothèses et limites');
  });

  it('cites the JRC with the radiation database and the dates', () => {
    // A wrapped paragraph's lines follow each other: join them back into one text.
    const text = pages.map(pageText).join('\n').replace(/\n/g, ' ');
    expect(text).toContain('Source : Commission européenne, Centre commun de recherche (JRC) — PVGIS v5.3, base de données de rayonnement PVGIS-SARAH3');
    expect(text).toContain('21/10/2026'); // fetched
    expect(text).toContain('22/10/2026'); // simulated
  });

  it('carries the cartouche with dossier number, date, installer and page on every page', () => {
    pages.forEach((page, i) => {
      const text = pageText(page);
      expect(text).toContain('434 - 303');
      expect(text).toContain('22/10/2026');
      expect(text).toContain('TEST INSTALLATEUR SARL');
      expect(text).toContain(`Annexe N°2 — page ${i + 1}/3`);
    });
  });

  it('keeps everything on the page, with no text under 7 pt', () => {
    for (const page of pages) {
      expect(everythingOnPage(page)).toBe(true);
      expect(Math.min(...page.texts.map((t) => t.size))).toBeGreaterThanOrEqual(7);
    }
  });

  it('says « non disponible » where PVcalc failed, and still renders', async () => {
    const withoutPvcalc = await extractPdfContent(await renderProductionReport({ ...SIMULATION, pvcalc: null }, CONTEXT));
    expect(withoutPvcalc).toHaveLength(3);
    const text = pageText(withoutPvcalc[2]!);
    expect(text).toContain('non disponible');
    expect(text).not.toContain('–2,57 %');
    expect(pageText(withoutPvcalc[0]!)).toContain('PVGIS v5.3, série horaire 2020');
  });

  it('cites PVGIS without a database name when the data does not give one', async () => {
    const unknown = { radiationDb: null, meteoDb: null, elevationM: null, useHorizon: null, horizonSource: null, fetchedAt: null };
    const report = await extractPdfContent(await renderProductionReport({ ...SIMULATION, pvgis: unknown, pvcalc: null }, CONTEXT));
    const text = report.map(pageText).join('\n').replace(/\n/g, ' ');
    expect(text).toContain('Source : Commission européenne, Centre commun de recherche (JRC) — PVGIS v5.3.');
    expect(text).not.toContain('base de données de rayonnement');
    expect(report.every((page) => everythingOnPage(page))).toBe(true);
  });

  it('prints the installer name in the header when there is no logo', () => {
    expect(findText(pages[0]!, 'TEST INSTALLATEUR SARL')!.y).toBeGreaterThan(780);
  });
});
