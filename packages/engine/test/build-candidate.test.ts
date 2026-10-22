import { describe, it, expect } from 'vitest';
import { buildCandidate, runEngine } from '../src';
import type { BuildCandidateResult, Candidate, CatalogInverter, CatalogModule, SizingCatalog } from '../src';
import { sizingCatalog, sizingContext } from './fixtures/sizing-catalog';

function moduleById(id: string): CatalogModule {
  const found = sizingCatalog.modules.find((m) => m.id === id);
  if (!found) throw new Error(`No module ${id} in the fixture`);
  return found;
}

function inverterById(id: string): CatalogInverter {
  const found = sizingCatalog.inverters.find((i) => i.id === id);
  if (!found) throw new Error(`No inverter ${id} in the fixture`);
  return found;
}

function expectCandidate(result: BuildCandidateResult): Candidate {
  if (!result.ok) throw new Error(`Expected a candidate, got: ${result.reason}`);
  return result.candidate;
}

const module450 = moduleById('module-450w');
const module550 = moduleById('module-550w');
const inverter3kW = inverterById('inverter-3kw');

describe('buildCandidate', () => {
  it('spreads 3 strings over 2 MPPTs as [2, 1]', () => {
    // 3 x 8 x 450 W = 10.8 kWp on the 10 kW inverter (2 MPPTs x 2 inputs); a 10 kVA client.
    const candidate = expectCandidate(
      buildCandidate(module450, inverterById('inverter-10kw'), 8, 3, sizingCatalog, {
        ...sizingContext,
        subscribedPowerKVA: 10,
      }),
    );
    expect(candidate.mppts.map((m) => m.stringsInParallel)).toEqual([2, 1]);
    expect(candidate.mppts.every((m) => m.modulesPerString === 8)).toBe(true);
  });

  it('picks the smallest DC switch that passes C09', () => {
    // 550 W string: Isc design current 1.25 x 14 A = 17.5 A > 16 A.
    const big = expectCandidate(buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, sizingContext));
    expect(big.dcSwitchId).toBe('dc-switch-32a');
    // 450 W string: 1.25 x 11.54 A = 14.4 A, the 16 A switch is enough.
    const small = expectCandidate(buildCandidate(module450, inverter3kW, 7, 1, sizingCatalog, sizingContext));
    expect(small.dcSwitchId).toBe('dc-switch-16a');
  });

  it('adds no DC fuse for one string per MPPT', () => {
    const candidate = expectCandidate(buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, sizingContext));
    expect(candidate.dcFuseId).toBeNull();
    expect(candidate.engineInput.dcFuse).toBeNull();
  });

  it('bumps the AC section on a long run', () => {
    const near = expectCandidate(buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, sizingContext));
    expect(near.acCable).toEqual({ cableId: 'cable-ac', sectionMm2: 2.5, lengthM: 10 });
    const far = expectCandidate(
      buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, { ...sizingContext, acLengthM: 60 }),
    );
    // 60 m at 13.7 A against 1 %: 6 mm² drops 2.2 %, 10 mm² 1.3 %, 16 mm² 0.8 %.
    expect(far.acCable).toEqual({ cableId: 'cable-ac', sectionMm2: 16, lengthM: 60 });
  });

  it('enlarges the AC section until the AC drop is within 1 %', () => {
    // 40 m at 13.7 A: 4 mm² drops 2.2 %, 6 mm² 1.5 % (both pass 3 %, neither 1 %); 10 mm² drops 0.9 %.
    const context = { ...sizingContext, acLengthM: 40 };
    const lenient = expectCandidate(
      buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, { ...context, maxAcVoltageDropPct: 3 }),
    );
    expect(lenient.acCable.sectionMm2).toBe(4);
    const strict = expectCandidate(buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, context));
    expect(strict.acCable.sectionMm2).toBe(10);
    expect(strict.engineInput.maxAcVoltageDropPct).toBe(1);
    expect(runEngine(strict.engineInput).derived.DU_AC_PCT).toBeLessThanOrEqual(1);
  });

  it('keeps the DC section chosen against 3 %', () => {
    const context = { ...sizingContext, dcLengthM: 40, acLengthM: 40 };
    const strictAc = expectCandidate(buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, context));
    const lenientAc = expectCandidate(
      buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, { ...context, maxAcVoltageDropPct: 3 }),
    );
    expect(strictAc.dcCable).toEqual(lenientAc.dcCable);
    expect(strictAc.engineInput.maxVoltageDropPct).toBe(3);
    expect(runEngine(strictAc.engineInput).derived.DU_DC_PCT).toBeLessThanOrEqual(3);
  });

  it('returns the AC voltage-drop reason when no section reaches 1 %', () => {
    // 100 m at 13.7 A: even 16 mm² drops about 1.4 %.
    const result = buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, { ...sizingContext, acLengthM: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Aucune section de câble AC ne respecte la chute de tension de 1 % sur 100 m.');
    }
  });

  it('returns a reason when no DC SPD passes', () => {
    const only600V: SizingCatalog = {
      ...sizingCatalog,
      spds: sizingCatalog.spds.filter((s) => s.id !== 'dc-spd-1000v'),
    };
    // 12 x 550 W: 1.2 x 12 x 49.9 V = 719 V > 600 V. Only the three-phase inverter's 1100 V
    // window takes a string this long, and the SPD is chosen before the engine runs.
    const result = buildCandidate(
      module550,
      inverterById('inverter-10kw-three-phase'),
      12,
      1,
      only600V,
      sizingContext,
    );
    expect(result).toEqual({ ok: false, reason: 'Aucun parafoudre DC compatible dans le catalogue.' });
  });

  it('picks the lowest-Uc DC SPD that passes both C10 and C11', () => {
    const candidate = expectCandidate(buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, sizingContext));
    expect(candidate.dcSpdId).toBe('dc-spd-600v');
    // A 600 V SPD whose Up (3.5 kV) is not below 0.8 x 4 kV is skipped for the 1000 V one.
    const highUp600V: SizingCatalog = {
      ...sizingCatalog,
      spds: sizingCatalog.spds.map((s) => {
        if (s.id === 'dc-spd-600v') return { ...s, upKV: 3.5 };
        if (s.id === 'dc-spd-1000v') return { ...s, upKV: 3 };
        return s;
      }),
    };
    const skipped = expectCandidate(buildCandidate(module550, inverter3kW, 6, 1, highUp600V, sizingContext));
    expect(skipped.dcSpdId).toBe('dc-spd-1000v');
  });

  it('returns a reason when an MPPT gets more strings than it has inputs', () => {
    expect(buildCandidate(module550, inverter3kW, 6, 2, sizingCatalog, sizingContext)).toEqual({
      ok: false,
      reason: "Trop de chaînes pour l'onduleur Sungrow SG3.0RS-S.",
    });
  });

  it('returns the message of the failing BLOCK check', () => {
    // A 5 kW inverter for a 4 kVA subscription: everything sizes, C23 blocks.
    expect(
      buildCandidate(module550, inverterById('inverter-5kw'), 9, 1, sizingCatalog, sizingContext),
    ).toEqual({ ok: false, reason: 'Puissance AC totale des onduleurs supérieure à la puissance souscrite' });
  });

  it('passes the module and inverter homologation dates to C20', () => {
    const candidate = expectCandidate(
      buildCandidate(module550, inverterById('inverter-5kw-expired'), 9, 1, sizingCatalog, {
        ...sizingContext,
        subscribedPowerKVA: 10,
      }),
    );
    expect(candidate.engineInput.equipmentHomologationExpiries).toEqual(['2028-04-29', '2020-01-01']);
    expect(candidate.engineResult.checks.find((c) => c.id === 'C20')?.pass).toBe(false);
  });

  it('produces an engine input with no blocking failure', () => {
    const candidate = expectCandidate(buildCandidate(module550, inverter3kW, 6, 1, sizingCatalog, sizingContext));
    expect(candidate.engineResult.hasBlockingFailure).toBe(false);
    expect(candidate.engineInput.subscribedPowerKVA).toBe(4);
    expect(candidate.engineResult.checks.find((c) => c.id === 'C23')?.pass).toBe(true);
    expect(candidate).toMatchObject({
      modulesPerString: 6,
      stringCount: 1,
      mppts: [{ stringsInParallel: 1, modulesPerString: 6 }],
      dcSwitchId: 'dc-switch-32a',
      dcFuseId: null,
      dcSpdId: 'dc-spd-600v',
      acBreakerId: 'ac-breaker-16a',
      acSpdId: 'ac-spd-275v',
      dcCable: { cableId: 'cable-dc', sectionMm2: 4, lengthM: 15 },
      acCable: { cableId: 'cable-ac', sectionMm2: 2.5, lengthM: 10 },
      earthCableId: 'cable-earth',
    });
    expect(candidate.engineInput.site).toEqual({ phases: 1, lightningRod: false, gps: { lat: 34.42, lon: 8.78 } });
    expect(candidate.engineInput.acIsolator).toBeNull();
  });
});
