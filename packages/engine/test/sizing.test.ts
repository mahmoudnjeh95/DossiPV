import { describe, it, expect } from 'vitest';
import { MAX_COMBOS, MAX_ENGINE_RUNS, proposeInstallations } from '../src';
import type {
  CatalogInverter,
  CatalogModule,
  Proposal,
  SizingCatalog,
  SizingContext,
} from '../src';
import { sizingCatalog, sizingContext } from './fixtures/sizing-catalog';

const INELIGIBLE_INVERTER_IDS = [
  'inverter-10kw-three-phase',
  'inverter-5kw-not-approved',
  'inverter-5kw-expired',
];

/** A 21 096 kWh/yr, 14 kVA single-phase client. */
const largeConsumer: SizingContext = {
  ...sizingContext,
  annualConsumptionKWh: 21096,
  subscribedPowerKVA: 14,
  specificYieldKWhPerKWp: 1750,
};

function withKind(proposals: Proposal[], kind: Proposal['kinds'][number]): Proposal {
  const found = proposals.find((p) => p.kinds.includes(kind));
  if (!found) throw new Error(`No ${kind} proposal`);
  return found;
}

function firstOf(proposals: Proposal[]): Proposal {
  const first = proposals[0];
  if (!first) throw new Error('No proposal');
  return first;
}

function byId<T extends { id: string }>(items: T[], id: string): T {
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`No ${id} in the fixture`);
  return found;
}

describe('proposeInstallations', () => {
  it('recommends a single-phase installation close to the need', () => {
    const { proposals, noSolutionReasons } = proposeInstallations(sizingCatalog, sizingContext);

    expect(noSolutionReasons).toEqual([]);
    const first = firstOf(proposals);
    expect(first.kinds).toContain('RECOMMENDED');
    expect(first.coveragePct).toBeGreaterThanOrEqual(85);
    expect(first.coveragePct).toBeLessThanOrEqual(115);
    expect(first.candidate.inverter.phases).toBe(1);
    expect(first.candidate.inverter.pacW).toBeLessThanOrEqual(4000);
    expect(first.candidate.engineResult.hasBlockingFailure).toBe(false);
    expect(first.explanation).toContain(
      `Production estimée la plus proche de la consommation (${first.coveragePct} %).`,
    );
  });

  it('never proposes ineligible inverters', () => {
    const { proposals } = proposeInstallations(sizingCatalog, sizingContext);

    expect(proposals.length).toBeGreaterThan(0);
    for (const proposal of proposals) {
      expect(INELIGIBLE_INVERTER_IDS).not.toContain(proposal.candidate.inverter.id);
      expect(proposal.candidate.inverter.pacW).toBeLessThanOrEqual(4000);
    }
  });

  it('explains why there is no solution', () => {
    const result = proposeInstallations(sizingCatalog, {
      ...sizingContext,
      subscribedPowerKVA: 1.5,
    });

    expect(result.proposals).toEqual([]);
    expect(result.noSolutionReasons[0]).toBe(
      'Aucun onduleur monophasé homologué STEG de 1,5 kVA ou moins dans le catalogue.',
    );
  });

  it('explains that no module is in the 380 to 720 W range', () => {
    const catalog: SizingCatalog = {
      ...sizingCatalog,
      modules: sizingCatalog.modules.map((m) => ({ ...m, pmaxW: 300 })),
    };

    const result = proposeInstallations(catalog, sizingContext);

    expect(result.proposals).toEqual([]);
    expect(result.noSolutionReasons).toEqual([
      'Aucun module homologué de 380 à 720 W dans le catalogue.',
    ]);
  });

  it('explains that no combination covers 50 to 130 % of the need', () => {
    const result = proposeInstallations(sizingCatalog, {
      ...sizingContext,
      annualConsumptionKWh: 100_000,
    });

    expect(result.proposals).toEqual([]);
    expect(result.noSolutionReasons).toEqual([
      'Aucune combinaison panneaux/onduleur ne couvre entre 50 % et 130 % de la consommation.',
    ]);
  });

  it('gives the most frequent engine reasons when every combination fails', () => {
    // No earth cable: every combination that gets past its other items fails on it.
    const catalog: SizingCatalog = {
      ...sizingCatalog,
      cables: sizingCatalog.cables.filter((cable) => cable.usage !== 'EARTH'),
    };

    const result = proposeInstallations(catalog, sizingContext);

    expect(result.proposals).toEqual([]);
    expect(result.noSolutionReasons[0]).toBe('Aucun câble de terre de 16 mm² dans le catalogue.');
    expect(result.noSolutionReasons.length).toBeLessThanOrEqual(3);
  });

  it('objectives pick different installations for a large consumer', () => {
    const { proposals } = proposeInstallations(sizingCatalog, largeConsumer);

    const recommended = withKind(proposals, 'RECOMMENDED');
    const economic = withKind(proposals, 'ECONOMIC');
    const maxProduction = withKind(proposals, 'MAX_PRODUCTION');
    expect(maxProduction.annualProductionKWh).toBeGreaterThanOrEqual(
      recommended.annualProductionKWh,
    );
    expect(economic.moduleCount).toBeLessThanOrEqual(recommended.moduleCount);
    expect(economic.coveragePct).toBeGreaterThanOrEqual(80);
    expect(maxProduction.coveragePct).toBeLessThanOrEqual(120);
    for (const proposal of proposals) {
      expect(proposal.coveragePct).toBeLessThanOrEqual(130);
      expect(proposal.candidate.inverter.pacW).toBeLessThanOrEqual(14000);
    }
    expect(economic.explanation).toContain(
      'Le moins de panneaux pour couvrir au moins 80 % de la consommation.',
    );
    expect(maxProduction.explanation).toContain(
      'La plus forte production possible avec 14 kVA souscrits.',
    );
  });

  it('merges objectives that pick the same candidate', () => {
    for (const context of [sizingContext, largeConsumer]) {
      const { proposals } = proposeInstallations(sizingCatalog, context);

      const keys = proposals.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(proposals.length).toBeLessThanOrEqual(3);
      const kinds = proposals.flatMap((p) => p.kinds);
      expect([...kinds].sort()).toEqual(['ECONOMIC', 'MAX_PRODUCTION', 'RECOMMENDED']);
    }
  });

  it('keys, figures and explanation of a proposal', () => {
    const { proposals } = proposeInstallations(sizingCatalog, sizingContext);

    for (const p of proposals) {
      const { module, inverter, modulesPerString, stringCount } = p.candidate;
      expect(p.key).toBe(`${module.id}|${inverter.id}|${modulesPerString}x${stringCount}`);
      expect(p.moduleCount).toBe(modulesPerString * stringCount);
      expect(p.dcPowerKWp).toBeCloseTo((p.moduleCount * module.pmaxW) / 1000, 9);
      expect(p.acPowerKW).toBe(inverter.pacW / 1000);
      expect(p.annualProductionKWh).toBe(Math.round(p.dcPowerKWp * 1600));
      expect(p.coveragePct).toBe(Math.round((p.annualProductionKWh / 3000) * 100));
      expect(p.roofAreaM2).toBeGreaterThan(0);
      expect(Math.round(p.roofAreaM2 * 10)).toBeCloseTo(p.roofAreaM2 * 10, 9);
    }
    const merged = proposals.find((p) => p.kinds.length > 1);
    if (merged) {
      expect(merged.explanation.split('. ').length).toBe(merged.kinds.length);
    }
  });

  it('computes the roof area from the module footprint and the row spacing', () => {
    const { proposals } = proposeInstallations(sizingCatalog, sizingContext);
    const p = firstOf(proposals);
    const { module } = p.candidate;
    const lengthM = module.lengthMm / 1000;
    const tilt = (30 * Math.PI) / 180;
    // computeRowSpacingM: L·sin(tilt) / tan(90° − |lat − (−23.45°)|), the winter-solstice noon sun.
    const elevation = ((90 - Math.abs(34.42 + 23.45)) * Math.PI) / 180;
    const spacing = (lengthM * Math.sin(tilt)) / Math.tan(elevation);
    const expected = p.moduleCount * (module.widthMm / 1000) * (lengthM * Math.cos(tilt) + spacing);

    expect(p.roofAreaM2).toBeCloseTo(Math.round(expected * 10) / 10, 9);
  });

  it('computes the saving from the bill price', () => {
    const { proposals } = proposeInstallations(sizingCatalog, sizingContext);
    expect(proposals.length).toBeGreaterThan(0);
    for (const p of proposals) {
      expect(p.yearlySavingTND).toBe(Math.round(Math.min(p.annualProductionKWh, 3000) * 0.12));
    }

    const withoutPrice = proposeInstallations(sizingCatalog, {
      ...sizingContext,
      averagePriceTNDPerKWh: null,
    });
    expect(withoutPrice.proposals.length).toBeGreaterThan(0);
    for (const p of withoutPrice.proposals) {
      expect(p.yearlySavingTND).toBeNull();
    }
  });

  it('caps engine runs', () => {
    const result = proposeInstallations(syntheticCatalog(60, 40), largeConsumer);

    expect(result.stats.combinations).toBe(28_800);
    expect(result.stats.engineRuns).toBeLessThanOrEqual(MAX_ENGINE_RUNS);
    expect(result.stats.engineRuns).toBe(MAX_ENGINE_RUNS);
    expect(result.proposals.length).toBeGreaterThan(0);
  }, 30_000);

  it('caps the enumerated combinations', () => {
    // 200 x 100 pairs x 12 layouts = 240 000 plausible combinations, more than MAX_COMBOS.
    const result = proposeInstallations(syntheticCatalog(200, 100), largeConsumer);

    expect(result.stats.combinations).toBe(MAX_COMBOS);
    expect(result.stats.engineRuns).toBe(MAX_ENGINE_RUNS);
    expect(result.proposals.length).toBeGreaterThan(0);
  }, 30_000);

  it('ignores items with malformed electrical values and still returns', () => {
    const module450 = byId(sizingCatalog.modules, 'module-450w');
    const inverter2kW = byId(sizingCatalog.inverters, 'inverter-2kw');
    const catalog: SizingCatalog = {
      ...sizingCatalog,
      modules: [
        ...sizingCatalog.modules,
        { ...module450, id: 'module-zero-pmax', pmaxW: 0 },
        { ...module450, id: 'module-zero-voc', vocV: 0 },
        { ...module450, id: 'module-nan-vmp', vmpV: Number.NaN },
        { ...module450, id: 'module-tiny-vmp', vmpV: 1e-9 },
      ],
      inverters: [
        ...sizingCatalog.inverters,
        { ...inverter2kW, id: 'inverter-infinite-inputs', inputsPerMppt: Number.POSITIVE_INFINITY },
        { ...inverter2kW, id: 'inverter-huge-mppts', mpptCount: 1e9 },
        { ...inverter2kW, id: 'inverter-zero-pac', pacW: 0 },
        { ...inverter2kW, id: 'inverter-infinite-vdc', vdcMaxV: Number.POSITIVE_INFINITY },
      ],
    };

    const result = proposeInstallations(catalog, sizingContext);

    // The malformed items add no combination at all: same runs and proposals as the clean fixture.
    const clean = proposeInstallations(sizingCatalog, sizingContext);
    expect(result.stats).toEqual(clean.stats);
    expect(result.proposals.map((p) => p.key)).toEqual(clean.proposals.map((p) => p.key));
  });

  it('keeps the enumeration finite for extreme but well-formed voltages', () => {
    // Finite, positive, absurd: nsOptMax and nsMax are in the billions; ns is clamped to 100.
    const inverter2kW = byId(sizingCatalog.inverters, 'inverter-2kw');
    const catalog: SizingCatalog = {
      ...sizingCatalog,
      inverters: [{ ...inverter2kW, id: 'inverter-huge-voltage', vdcMaxV: 1e12, mpptMaxV: 1e12 }],
    };

    const result = proposeInstallations(catalog, sizingContext);

    expect(result.stats.combinations).toBeGreaterThan(0);
    expect(result.stats.combinations).toBeLessThan(100);
  });

  it('merges every objective won by the only valid installation', () => {
    // 450 W on the 2 kW inverter: 4 modules (1.8 kWp, 2 880 kWh, 115 %) is the only layout
    // within the DC/AC and coverage bands for 2 500 kWh (5 modules would cover 144 %).
    const catalog: SizingCatalog = {
      ...sizingCatalog,
      modules: [byId(sizingCatalog.modules, 'module-450w')],
      inverters: [byId(sizingCatalog.inverters, 'inverter-2kw')],
    };

    const result = proposeInstallations(catalog, { ...sizingContext, annualConsumptionKWh: 2500 });

    expect(result.stats.engineRuns).toBe(1);
    expect(result.proposals).toHaveLength(1);
    const [only] = result.proposals;
    expect(only?.key).toBe('module-450w|inverter-2kw|4x1');
    expect(only?.kinds).toEqual(['RECOMMENDED', 'ECONOMIC', 'MAX_PRODUCTION']);
    expect(only?.explanation).toBe(
      'Production estimée la plus proche de la consommation (115 %). ' +
        'Le moins de panneaux pour couvrir au moins 80 % de la consommation. ' +
        'La plus forte production possible avec 4 kVA souscrits.',
    );
  });

  it('treats DC/AC ratios symmetric around 1.15 as a tie despite float noise', () => {
    // On the 2 kW inverter: 5 x 440 W = 2 200 W (ratio 1.1) and 4 x 600 W = 2 400 W (ratio 1.2)
    // both miss 3 680 kWh by 160 kWh. In floats |1.1 - 1.15| < |1.2 - 1.15|; once the distances
    // tie, the next rule (fewer modules) must pick the 4 x 600 W installation.
    const base = byId(sizingCatalog.modules, 'module-450w');
    const catalog: SizingCatalog = {
      ...sizingCatalog,
      modules: [
        { ...base, id: 'module-440w', model: 'AE440MC-144', pmaxW: 440 },
        { ...base, id: 'module-600w', model: 'AE600MC-144', pmaxW: 600 },
      ],
      inverters: [byId(sizingCatalog.inverters, 'inverter-2kw')],
    };

    const result = proposeInstallations(catalog, { ...sizingContext, annualConsumptionKWh: 3680 });

    expect(withKind(result.proposals, 'RECOMMENDED').key).toBe('module-600w|inverter-2kw|4x1');
  });
});

/** `moduleCount` copies of the 450 W module and `inverterCount` 3-MPPT copies of the 10 kW
 * inverter: 12 plausible layouts per pair for the large consumer. */
function syntheticCatalog(moduleCount: number, inverterCount: number): SizingCatalog {
  const baseModule = byId(sizingCatalog.modules, 'module-450w');
  const baseInverter = byId(sizingCatalog.inverters, 'inverter-10kw');
  const modules: CatalogModule[] = Array.from({ length: moduleCount }, (_, i) => ({
    ...baseModule,
    id: `module-${i}`,
    model: `AE450MC-144 #${i}`,
  }));
  const inverters: CatalogInverter[] = Array.from({ length: inverterCount }, (_, i) => ({
    ...baseInverter,
    id: `inverter-${i}`,
    model: `SUN-10K-G02P1-EU-AM2 #${i}`,
    mpptCount: 3,
  }));
  return { ...sizingCatalog, modules, inverters };
}
