import { describe, it, expect } from 'vitest';
import { MAX_ENGINE_RUNS, proposeInstallations } from '../src';
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
    const baseModule = byId(sizingCatalog.modules, 'module-450w');
    const baseInverter = byId(sizingCatalog.inverters, 'inverter-10kw');
    // Synthetic 3-MPPT variants of the 10 kW inverter: 12 plausible layouts per pair, so
    // 60 x 40 pairs give 28 800 combinations, more than MAX_ENGINE_RUNS.
    const modules: CatalogModule[] = Array.from({ length: 60 }, (_, i) => ({
      ...baseModule,
      id: `module-${i}`,
      model: `AE450MC-144 #${i}`,
    }));
    const inverters: CatalogInverter[] = Array.from({ length: 40 }, (_, i) => ({
      ...baseInverter,
      id: `inverter-${i}`,
      model: `SUN-10K-G02P1-EU-AM2 #${i}`,
      mpptCount: 3,
    }));

    const result = proposeInstallations({ ...sizingCatalog, modules, inverters }, largeConsumer);

    expect(result.stats.engineRuns).toBeLessThanOrEqual(MAX_ENGINE_RUNS);
    expect(result.stats.engineRuns).toBe(MAX_ENGINE_RUNS);
    expect(result.proposals.length).toBeGreaterThan(0);
  }, 30_000);
});
