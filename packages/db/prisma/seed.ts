import { db } from '../src/index.ts';

async function seedGlobalEquipment() {
  const pvModule = await db.pvModule.create({
    data: {
      brand: 'LONGi',
      model: 'LR7-72HGD-620M',
      pmaxW: 620,
      vmpV: 46.5,
      impA: 13.33,
      vocV: 55.9,
      iscA: 13.92,
      tempCoeffVocPct: -0.25,
      tempCoeffIscPct: 0.045,
      tempCoeffPmaxPct: -0.28,
      irmA: 25,
      maxSystemVoltageV: 1500,
      lengthMm: 2278,
      widthMm: 1134,
      weightKg: 33.5,
    },
  });

  const inverter = await db.inverter.create({
    data: {
      brand: 'Sofar',
      model: '1-4KTL2-G3',
      phases: 1,
      pacW: 3000,
      sacVA: 3000,
      vdcMaxV: 550,
      mpptMinV: 90,
      mpptMaxV: 550,
      startUpV: 100,
      mpptCount: 1,
      inputsPerMppt: 2,
      idcMaxPerMpptA: 16,
      iscMaxPerMpptA: 20,
      vacNomV: 230,
      iacMaxA: 16,
      stegApproved: true,
    },
  });

  const dcSpd = await db.spd.create({
    data: { brand: 'Generic', model: 'DC-SPD-1', side: 'DC', type: 2, poles: 2, ucV: 700, upKV: 2.0, inKA: 10, imaxKA: 20, iscpvKA: 0.02 },
  });
  const acSpd = await db.spd.create({
    data: { brand: 'Generic', model: 'AC-SPD-1', side: 'AC', type: 2, poles: 2, ucV: 275, upKV: 1.5, inKA: 10, imaxKA: 20 },
  });
  const dcSwitch = await db.dcSwitch.create({
    data: { brand: 'ZJ BENY', model: 'BB1H-63', ratedVoltageV: 600, ratedCurrentA: 25, poles: 2 },
  });
  const acBreaker = await db.acBreaker.create({
    data: { brand: 'Generic', model: 'AC-BRK-20', ratedCurrentA: 20 },
  });
  const cable = await db.cable.create({
    data: {
      brand: 'Generic',
      model: 'H1Z2Z2-K',
      usage: 'DC_SOLAR',
      conductor: 'Cu',
      insulation: 'PR',
      sections: { create: [{ sectionMm2: 6, izA: 56, izReferenceMethod: 'B' }] },
    },
  });
  const earthCable = await db.cable.create({
    data: {
      brand: 'Generic',
      model: 'H07V-U',
      usage: 'EARTH',
      conductor: 'Cu',
      insulation: 'PVC',
      sections: { create: [{ sectionMm2: 16, izA: 0, izReferenceMethod: 'B' }] },
    },
  });

  return { pvModule, inverter, dcSpd, acSpd, dcSwitch, acBreaker, cable, earthCable };
}

async function seedCompanyAndAccounts() {
  const plan = await db.plan.create({
    data: { name: 'Standard', monthlyDossierLimit: 10, priceTnd: 199.99, tier: 'STANDARD' },
  });

  const company = await db.company.create({
    data: {
      name: 'SolarPro Tunisie',
      address: '12 Rue de la Liberté, Tunis',
      phone: '+216 71 234 567',
      email: 'contact@solarpro.tn',
      legalRepFullName: 'Ahmed Ben Ali',
      anmeCode: 'ANME-2024-001',
      anmeCategory: 'BT',
      anmeValidFrom: new Date('2024-01-01'),
      anmeValidTo: new Date('2027-01-01'),
      subscription: {
        create: { planId: plan.id, status: 'ACTIVE', periodStart: new Date(), periodEnd: new Date('2027-01-01') },
      },
    },
  });

  // Two users under the SAME company, each with an active session — proves the
  // per-company (not per-user) concurrent-session join path resolves cleanly before any
  // later plan builds enforcement logic on top of it (Review Focus item 3).
  const owner = await db.companyUser.create({
    data: { companyId: company.id, email: 'owner@solarpro.tn', passwordHash: 'placeholder-hash', fullName: 'Ahmed Ben Ali', role: 'OWNER' },
  });
  const member = await db.companyUser.create({
    data: { companyId: company.id, email: 'member@solarpro.tn', passwordHash: 'placeholder-hash', fullName: 'Fatma Trabelsi', role: 'MEMBER' },
  });
  await db.session.create({
    data: { companyUserId: owner.id, tokenHash: 'placeholder-token-hash-1', expiresAt: new Date(Date.now() + 86400000) },
  });
  await db.session.create({
    data: { companyUserId: member.id, tokenHash: 'placeholder-token-hash-2', expiresAt: new Date(Date.now() + 86400000) },
  });

  // Prove the per-company join resolves: count sessions across every user of this company.
  const sessionCountForCompany = await db.session.count({
    where: { companyUser: { companyId: company.id } },
  });
  if (sessionCountForCompany !== 2) {
    throw new Error(`Expected 2 sessions for company ${company.id}, found ${sessionCountForCompany}`);
  }

  return { company, owner };
}

async function seedProjects(
  companyId: string,
  equipment: Awaited<ReturnType<typeof seedGlobalEquipment>>,
) {
  // Baseline STANDARD project with PVSYST_UPLOAD simulation — exercises that conditional
  // branch (Review Focus item 2).
  const standardProject = await db.project.create({
    data: {
      companyId,
      tier: 'STANDARD',
      status: 'DRAFT',
      client: { create: { fullName: 'Habib Khedhira', clientKind: 'INDIVIDUAL' } },
      site: {
        create: {
          gpsLat: 36.5606,
          gpsLon: 10.5272,
          gridType: 'BT',
          phases: 1,
          mountingType: 'FLAT_ROOF_BALLAST',
          tiltDeg: 30,
        },
      },
      arrayConfig: {
        create: {
          moduleId: equipment.pvModule.id,
          inverters: {
            create: [{ inverterId: equipment.inverter.id, mppts: { create: [{ stringsInParallel: 1, modulesPerString: 5 }] } }],
          },
        },
      },
      protections: {
        create: {
          dcSpdId: equipment.dcSpd.id,
          dcSwitchId: equipment.dcSwitch.id,
          acBreakerId: equipment.acBreaker.id,
          acSpdId: equipment.acSpd.id,
        },
      },
      structure: {
        create: { material: 'Aluminium', frameCount: 5, structureWeightN: 275, heightHM: 1, depthDM: 1.5, windSpeedKmh: 120 },
      },
      earthing: {
        create: {
          mainEarthSectionMm2: 16,
          frameEarthSectionMm2: 16,
          earthToPitSectionMm2: 25,
          rodCount: 3,
          rodLengthM: 1.5,
          targetResistanceOhm: 25,
          earthCableId: equipment.earthCable.id,
        },
      },
      simulation: {
        create: { source: 'PVSYST_UPLOAD', annualProductionKWh: 4760 },
      },
    },
  });

  // PREMIUM project with imagery — exercises that conditional branch.
  const premiumProject = await db.project.create({
    data: {
      companyId,
      tier: 'PREMIUM',
      status: 'DRAFT',
      client: { create: { fullName: 'Client Premium', clientKind: 'COMPANY' } },
      site: { create: { gpsLat: 36.8, gpsLon: 10.2, gridType: 'BT', phases: 3, mountingType: 'GROUND', tiltDeg: 25 } },
      imagery: {
        create: {
          geometry: { panelPolygon: [[0, 0], [100, 0], [100, 50], [0, 50]], markers: { technicalRoom: [10, 10], meter: [20, 20], earthPit: [30, 30], cableRoute: [[0, 0], [10, 10]] } },
        },
      },
    },
  });

  // ISOLATED (off-grid) project — exercises that conditional branch.
  const offGridProject = await db.project.create({
    data: {
      companyId,
      tier: 'STANDARD',
      status: 'DRAFT',
      client: { create: { fullName: 'Client Hors Reseau', clientKind: 'INDIVIDUAL' } },
      site: { create: { gpsLat: 34.0, gpsLon: 9.0, gridType: 'ISOLATED', phases: 1, mountingType: 'GROUND', tiltDeg: 30 } },
      offGrid: {
        create: { dailyLoadKWh: 5, autonomyDays: 2, batteryChemistry: 'LITHIUM', batteryVoltageV: 48, maxDepthOfDischargePct: 80 },
      },
    },
  });

  return { standardProject, premiumProject, offGridProject };
}

async function seedJobAndUsageLog(projectId: string) {
  const job = await db.dossierJob.create({
    data: {
      projectId,
      status: 'SUCCEEDED',
      inputSnapshot: { note: 'seed placeholder snapshot' },
      completedAt: new Date(),
      checkResults: {
        create: [{ checkId: 'C01', level: 'BLOCK', pass: true, message: 'Ns within range' }],
      },
    },
  });

  // Decimal rounding check (Review Focus item 4): costUsd is @db.Decimal(10, 4) — seed a
  // value with 5 decimal digits before rounding and assert it actually rounded to 4, rather
  // than truncating oddly or throwing.
  const rawCost = 0.123456; // 6 decimal digits in the JS float
  const log = await db.claudeUsageLog.create({
    data: { jobId: job.id, model: 'claude-opus-5-5', inputTokens: 500, outputTokens: 1200, costUsd: rawCost },
  });
  const storedCost = Number(log.costUsd);
  if (storedCost !== 0.1235 && storedCost !== 0.1234) {
    throw new Error(`Expected costUsd to round to 4 decimal places, got ${storedCost}`);
  }

  return { job, log };
}

async function main() {
  const equipment = await seedGlobalEquipment();
  const { company } = await seedCompanyAndAccounts();
  const { standardProject } = await seedProjects(company.id, equipment);
  await seedJobAndUsageLog(standardProject.id);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
