import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@dossipv/db';
import { buildProjectSnapshot, type ProjectSnapshot } from '../src/build-snapshot';

let companyId: string;
let projectId: string;
let pvModuleId: string;
let inverterId: string;
let cableId: string;

// Each run gets its own brand/email suffix so concurrent or previously-aborted runs of this
// same file never collide on a shared name — afterEach below also deletes catalog rows by the
// exact id created in beforeEach, never by this shared brand, so one test's cleanup can never
// fail trying to delete a row a DIFFERENT run (or a stale leftover) still references.
let runId: string;

beforeEach(async () => {
  runId = crypto.randomUUID();

  const company = await db.company.create({
    data: {
      name: 'Snapshot Test Co',
      address: 'Test address',
      phone: '+216 00 000 000',
      email: `snapshot-test-${runId}@example.com`,
      legalRepFullName: 'Test Rep',
      anmeCode: 'SNAP-0001',
      anmeCategory: 'BT',
      anmeValidFrom: new Date('2024-01-01'),
      anmeValidTo: new Date('2030-01-01'),
    },
  });
  companyId = company.id;

  const pvModule = await db.pvModule.create({
    data: {
      brand: `TestBrand-${runId}`,
      model: 'TestModule',
      pmaxW: 400,
      vmpV: 40,
      impA: 10,
      vocV: 48,
      iscA: 10.5,
      tempCoeffVocPct: -0.3,
      tempCoeffIscPct: 0.05,
      tempCoeffPmaxPct: -0.35,
      irmA: 15,
      maxSystemVoltageV: 1000,
      lengthMm: 2000,
      widthMm: 1000,
      weightKg: 22,
    },
  });
  const inverter = await db.inverter.create({
    data: {
      brand: `TestInv-${runId}`,
      model: 'TestModel',
      phases: 1,
      pacW: 3000,
      sacVA: 3000,
      vdcMaxV: 500,
      mpptMinV: 80,
      mpptMaxV: 500,
      startUpV: 90,
      mpptCount: 1,
      inputsPerMppt: 2,
      idcMaxPerMpptA: 15,
      iscMaxPerMpptA: 18,
      vacNomV: 230,
      iacMaxA: 14,
    },
  });

  const cable = await db.cable.create({
    data: {
      brand: `TestCable-${runId}`,
      model: 'TestDC',
      usage: 'DC_SOLAR',
      conductor: 'Cu',
      insulation: 'PR',
      sections: { create: [{ sectionMm2: 6, izA: 56, izReferenceMethod: 'B' }] },
    },
  });

  pvModuleId = pvModule.id;
  inverterId = inverter.id;
  cableId = cable.id;

  const project = await db.project.create({
    data: {
      companyId,
      tier: 'STANDARD',
      cableRuns: {
        create: [
          {
            circuitType: 'DC',
            label: 'Snapshot DC run',
            cableId: cable.id,
            sectionMm2: 6,
            lengthM: 10,
            installMethod: '13',
            ambientContext: 'TRAY_SUN',
          },
        ],
      },
      client: { create: { fullName: 'Snapshot Client', clientKind: 'INDIVIDUAL' } },
      site: {
        create: {
          gpsLat: 36.8,
          gpsLon: 10.1,
          gridType: 'BT',
          phases: 1,
          mountingType: 'ROOF',
          tiltDeg: 30,
        },
      },
      arrayConfig: {
        create: {
          moduleId: pvModule.id,
          inverters: {
            create: [
              {
                inverterId: inverter.id,
                mppts: { create: [{ stringsInParallel: 1, modulesPerString: 5 }] },
              },
            ],
          },
        },
      },
    },
  });
  projectId = project.id;
});

afterEach(async () => {
  const arrayConfig = await db.projectArrayConfig.findUnique({
    where: { projectId },
    include: { inverters: true },
  });
  if (arrayConfig) {
    for (const inv of arrayConfig.inverters) {
      await db.projectArrayMppt.deleteMany({ where: { arrayInverterId: inv.id } });
    }
    await db.projectArrayInverter.deleteMany({ where: { arrayConfigId: arrayConfig.id } });
    await db.projectArrayConfig.delete({ where: { id: arrayConfig.id } });
  }
  await db.projectCableRun.deleteMany({ where: { projectId } });
  await db.projectSite.deleteMany({ where: { projectId } });
  await db.projectClient.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  // Deleted by the exact id this run created, never by the (now per-run-unique) brand name —
  // scoping by id means one test's cleanup can never fail on a row a different run still owns.
  await db.pvModule.delete({ where: { id: pvModuleId } });
  await db.inverter.delete({ where: { id: inverterId } });
  await db.cableSection.deleteMany({ where: { cableId } });
  await db.cable.delete({ where: { id: cableId } });
  await db.company.delete({ where: { id: companyId } });
});

describe('buildProjectSnapshot', () => {
  it('captures the module and inverter by VALUE, not just by id', async () => {
    const snapshot = await buildProjectSnapshot(projectId);

    expect(snapshot.arrayConfig?.module.brand).toBe(`TestBrand-${runId}`);
    expect(snapshot.arrayConfig?.module.pmaxW).toBe(400);
    expect(snapshot.arrayConfig?.inverters[0]!.inverter.brand).toBe(`TestInv-${runId}`);
  });

  it("captures each cable run's cable and its sections by VALUE, not just the cableId", async () => {
    const snapshot = await buildProjectSnapshot(projectId);

    expect(snapshot.cableRuns).toHaveLength(1);
    expect(snapshot.cableRuns[0]!.cable.brand).toBe(`TestCable-${runId}`);
    expect(snapshot.cableRuns[0]!.cable.sections[0]).toMatchObject({
      sectionMm2: 6,
      izA: 56,
      izReferenceMethod: 'B',
    });
  });

  it('round-trips losslessly through JSON.stringify/JSON.parse', async () => {
    const snapshot = await buildProjectSnapshot(projectId);

    const roundTripped = JSON.parse(JSON.stringify(snapshot)) as ProjectSnapshot;

    expect(roundTripped.arrayConfig!.module.pmaxW).toBe(400);
    expect(roundTripped.client!.fullName).toBe('Snapshot Client');
    expect(typeof roundTripped.capturedAt).toBe('string');
  });

  it('includes a capturedAt ISO timestamp close to now', async () => {
    const before = Date.now();
    const snapshot = await buildProjectSnapshot(projectId);
    const after = Date.now();

    const capturedAtMs = new Date(snapshot.capturedAt).getTime();
    expect(capturedAtMs).toBeGreaterThanOrEqual(before);
    expect(capturedAtMs).toBeLessThanOrEqual(after);
  });
});
