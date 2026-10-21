import type { Prisma } from '@dossipv/db';
import type {
  RunEngineInput,
  CableRunInput,
  PvModuleInput,
  InverterArrayEntry,
} from '@dossipv/engine';
import { AMBIENT_TEMP_BY_CONTEXT } from './labels';

/**
 * The Prisma `include` every engine-driven page loads a project with. Exported so the
 * overview page, the generate action and the tests all load the exact same shape.
 */
export const PROJECT_ENGINE_INCLUDE = {
  company: true,
  client: true,
  site: true,
  arrayConfig: {
    include: { module: true, inverters: { include: { inverter: true, mppts: true } } },
  },
  protections: {
    include: {
      dcSpd: true,
      dcSwitch: true,
      dcFuse: true,
      acBreaker: true,
      acSpd: true,
      acIsolator: true,
    },
  },
  cablingConfig: { include: { connector: true, cableTray: true } },
  cableRuns: { include: { cable: { include: { sections: true } } } },
  structure: true,
  earthing: { include: { earthCable: { include: { sections: true } }, distributionBlock: true } },
  simulation: true,
  annexes: { include: { extraFiles: true } },
  jobs: { orderBy: { startedAt: 'desc' } },
  billImport: true,
} satisfies Prisma.ProjectInclude;

export type ProjectForEngine = Prisma.ProjectGetPayload<{ include: typeof PROJECT_ENGINE_INCLUDE }>;

/** Non-engine data the dossier-worker's placeholder map needs alongside the engine input. */
export interface ProjectMetaForWorker {
  moduleBrandModel: string;
  inverterBrandModel: string;
  gridType: string;
  mountingType: string;
  structureMaterial: string;
  earthRodCount: number;
}

export type EngineInputResult =
  | { ok: true; input: RunEngineInput; meta: ProjectMetaForWorker }
  | { ok: false; missing: string[] };

function isPhases(value: number): value is 1 | 3 {
  return value === 1 || value === 3;
}

/** `YYYY-MM-DD` (UTC), the date format every engine input uses. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function collectHomologationExpiries(project: ProjectForEngine): Array<string | null> {
  const protections = project.protections;
  const items = [
    project.arrayConfig?.module,
    ...(project.arrayConfig?.inverters.map((entry) => entry.inverter) ?? []),
    protections?.dcSpd, protections?.dcSwitch, protections?.dcFuse,
    protections?.acBreaker, protections?.acSpd, protections?.acIsolator,
    ...project.cableRuns.map((run) => run.cable),
    project.earthing?.earthCable,
  ];
  return items.flatMap((item) => (item ? [item.homologationValidTo ? toIsoDate(item.homologationValidTo) : null] : []));
}

function buildCableRun(
  run: ProjectForEngine['cableRuns'][number],
  missing: string[],
  circuitLabel: string,
): CableRunInput | null {
  const section = run.cable.sections.find((s) => s.sectionMm2 === run.sectionMm2);
  if (!section) {
    missing.push(
      `Câblage : la section ${run.sectionMm2} mm² n'existe pas pour le câble ${run.cable.brand} ${run.cable.model} (${circuitLabel}).`,
    );
    return null;
  }
  const referenceMethod = section.izReferenceMethod;
  if (
    referenceMethod !== 'B' &&
    referenceMethod !== 'C' &&
    referenceMethod !== 'E' &&
    referenceMethod !== 'F'
  ) {
    missing.push(
      `Câblage : méthode de référence « ${referenceMethod} » inconnue (${circuitLabel}).`,
    );
    return null;
  }
  const conductor = run.cable.conductor;
  if (conductor !== 'Cu' && conductor !== 'Al') {
    missing.push(`Câblage : conducteur « ${conductor} » inconnu (${circuitLabel}).`);
    return null;
  }
  const insulation = run.cable.insulation;
  if (
    insulation !== 'PR' &&
    insulation !== 'PVC' &&
    insulation !== 'EPR' &&
    insulation !== 'XLPO'
  ) {
    missing.push(`Câblage : isolant « ${insulation} » inconnu (${circuitLabel}).`);
    return null;
  }
  const ambientTempC = AMBIENT_TEMP_BY_CONTEXT[run.ambientContext];
  if (ambientTempC === undefined) {
    missing.push(`Câblage : contexte ambiant « ${run.ambientContext} » inconnu (${circuitLabel}).`);
    return null;
  }
  return {
    conductor,
    insulation,
    sectionMm2: run.sectionMm2,
    lengthM: run.lengthM,
    installMethod: run.installMethod,
    referenceMethod,
    ambientTempC,
    groupedCircuits: run.groupedCircuits,
    layers: run.layers,
    izBaseA: section.izA,
  };
}

/**
 * Maps a fully-loaded project to `runEngine()`'s input. Returns every missing/invalid piece
 * at once (French, one line per problem) rather than the first one, so the overview page can
 * list everything the installer still has to fill in. Pure: no I/O, no Date.now() except as
 * the dossierDate fallback passed in by the caller.
 */
export function buildEngineInput(project: ProjectForEngine, now: Date): EngineInputResult {
  const missing: string[] = [];

  const site = project.site;
  if (!site) {
    missing.push('Site : section non renseignée.');
  }
  const arrayConfig = project.arrayConfig;
  if (!arrayConfig) {
    missing.push('Champ PV : section non renseignée.');
  } else if (arrayConfig.inverters.length === 0) {
    missing.push('Champ PV : aucun onduleur configuré.');
  } else if (arrayConfig.inverters.some((inv) => inv.mppts.length === 0)) {
    missing.push('Champ PV : chaque onduleur doit avoir au moins un MPPT configuré.');
  }
  const protections = project.protections;
  if (!protections) {
    missing.push('Protections : section non renseignée.');
  } else if (protections.dcSpd.iscpvKA === null) {
    missing.push(
      `Protections : le parafoudre DC ${protections.dcSpd.brand} ${protections.dcSpd.model} n'a pas de valeur Iscpv dans le catalogue.`,
    );
  }
  const cablingConfig = project.cablingConfig;
  if (!cablingConfig) {
    missing.push('Câblage : paramètres généraux non renseignés.');
  }
  const dcRunRow = project.cableRuns.find((run) => run.circuitType === 'DC');
  const acRunRow = project.cableRuns.find((run) => run.circuitType === 'AC');
  if (!dcRunRow) {
    missing.push('Câblage : aucune liaison DC définie.');
  }
  if (!acRunRow) {
    missing.push('Câblage : aucune liaison AC définie.');
  }
  const structure = project.structure;
  if (!structure) {
    missing.push('Structure : section non renseignée.');
  }
  if (!project.earthing) {
    missing.push('Mise à la terre : section non renseignée.');
  }

  const dcRun = dcRunRow ? buildCableRun(dcRunRow, missing, 'liaison DC') : null;
  const acRun = acRunRow ? buildCableRun(acRunRow, missing, 'liaison AC') : null;

  if (site && !isPhases(site.phases)) {
    missing.push(`Site : nombre de phases ${site.phases} invalide.`);
  }
  if (arrayConfig) {
    for (const inv of arrayConfig.inverters) {
      if (!isPhases(inv.inverter.phases)) {
        missing.push(
          `Champ PV : l'onduleur ${inv.inverter.brand} ${inv.inverter.model} a un nombre de phases invalide.`,
        );
      }
    }
  }

  if (
    missing.length > 0 ||
    !site ||
    !arrayConfig ||
    !protections ||
    !cablingConfig ||
    !dcRun ||
    !acRun ||
    !structure ||
    !project.earthing ||
    !isPhases(site.phases) ||
    protections.dcSpd.iscpvKA === null
  ) {
    return { ok: false, missing };
  }

  const dbModule = arrayConfig.module;
  const module: PvModuleInput = {
    pmaxW: dbModule.pmaxW,
    vmpV: dbModule.vmpV,
    impA: dbModule.impA,
    vocV: dbModule.vocV,
    iscA: dbModule.iscA,
    tempCoeffVocPct: dbModule.tempCoeffVocPct,
    tempCoeffIscPct: dbModule.tempCoeffIscPct,
    tempCoeffPmaxPct: dbModule.tempCoeffPmaxPct,
    ...(dbModule.tempCoeffVmpPct !== null ? { tempCoeffVmpPct: dbModule.tempCoeffVmpPct } : {}),
    irmA: dbModule.irmA,
    maxSystemVoltageV: dbModule.maxSystemVoltageV,
    bifacial: dbModule.bifacial,
    ...(dbModule.bifacialGainPct !== null ? { bifacialGainPct: dbModule.bifacialGainPct } : {}),
    lengthMm: dbModule.lengthMm,
    widthMm: dbModule.widthMm,
    weightKg: dbModule.weightKg,
    ...(dbModule.noctC !== null ? { noctC: dbModule.noctC } : {}),
  };

  const array: InverterArrayEntry[] = arrayConfig.inverters.map((inv) => ({
    inverter: {
      phases: inv.inverter.phases as 1 | 3,
      pacW: inv.inverter.pacW,
      sacVA: inv.inverter.sacVA,
      vdcMaxV: inv.inverter.vdcMaxV,
      mpptMinV: inv.inverter.mpptMinV,
      mpptMaxV: inv.inverter.mpptMaxV,
      startUpV: inv.inverter.startUpV,
      mpptCount: inv.inverter.mpptCount,
      inputsPerMppt: inv.inverter.inputsPerMppt,
      idcMaxPerMpptA: inv.inverter.idcMaxPerMpptA,
      iscMaxPerMpptA: inv.inverter.iscMaxPerMpptA,
      vacNomV: inv.inverter.vacNomV,
      iacMaxA: inv.inverter.iacMaxA,
      stegApproved: inv.inverter.stegApproved,
    },
    mppts: inv.mppts.map((mppt) => ({
      stringsInParallel: mppt.stringsInParallel,
      modulesPerString: mppt.modulesPerString,
    })),
  }));

  const input: RunEngineInput = {
    module,
    array,
    tMinC: arrayConfig.tMinC,
    tMaxC: arrayConfig.tMaxC,
    dcSwitch: {
      ratedVoltageV: protections.dcSwitch.ratedVoltageV,
      ratedCurrentA: protections.dcSwitch.ratedCurrentA,
    },
    dcFuse: protections.dcFuse
      ? {
          ratedCurrentA: protections.dcFuse.ratedCurrentA,
          ratedVoltageV: protections.dcFuse.ratedVoltageV,
        }
      : null,
    dcSpd: {
      ucV: protections.dcSpd.ucV,
      inKA: protections.dcSpd.inKA,
      iscpvKA: protections.dcSpd.iscpvKA,
      upKV: protections.dcSpd.upKV,
      type: protections.dcSpd.type,
    },
    acBreaker: { ratedCurrentA: protections.acBreaker.ratedCurrentA },
    acSpd: {
      ucV: protections.acSpd.ucV,
      upKV: protections.acSpd.upKV,
      type: protections.acSpd.type,
    },
    acIsolator: protections.acIsolator
      ? { ratedCurrentA: protections.acIsolator.ratedCurrentA }
      : null,
    equipmentImpulseWithstandKV: protections.equipmentImpulseWithstandKV,
    spdToEquipmentDistanceM: protections.spdToEquipmentDistanceM,
    dcRun,
    acRun,
    cosPhi: cablingConfig.cosPhi,
    lambdaOhmPerM: cablingConfig.lambdaOhmPerM,
    maxVoltageDropPct: cablingConfig.maxVoltageDropPct,
    structure: {
      // Stability inputs are optional (Tunisian dossiers need only material + wind speed); absent
      // keys make the engine skip the stability check.
      ...(structure.frameCount !== null ? { frameCount: structure.frameCount } : {}),
      ballastPerFrame: structure.ballastPerFrame ?? 0,
      ballastMassKg: structure.ballastMassKg ?? 0,
      ...(structure.structureWeightN !== null ? { structureWeightN: structure.structureWeightN } : {}),
      ...(structure.heightHM !== null ? { heightHM: structure.heightHM } : {}),
      ...(structure.depthDM !== null ? { depthDM: structure.depthDM } : {}),
      windSpeedKmh: structure.windSpeedKmh,
      tiltDeg: site.tiltDeg,
      ...(structure.liftCoeffNPerM2 !== null ? { liftCoeffNPerM2: structure.liftCoeffNPerM2 } : {}),
      ...(structure.dragCoeffNPerM2 !== null ? { dragCoeffNPerM2: structure.dragCoeffNPerM2 } : {}),
    },
    site: {
      phases: site.phases,
      lightningRod: site.lightningRod,
      gps: { lat: site.gpsLat, lon: site.gpsLon },
    },
    dossierDate: toIsoDate(project.dossierDate ?? now),
    companyAccreditationValidTo: toIsoDate(project.company.anmeValidTo),
    equipmentHomologationExpiries: collectHomologationExpiries(project),
    // C23 (inverter AC power within the subscribed power) runs whenever the client's power is known.
    ...(project.client?.subscribedPowerKVA != null ? { subscribedPowerKVA: project.client.subscribedPowerKVA } : {}),
  };

  const firstInverter = arrayConfig.inverters[0]!.inverter;
  const meta: ProjectMetaForWorker = {
    moduleBrandModel: `${dbModule.brand} ${dbModule.model}`,
    inverterBrandModel: `${firstInverter.brand} ${firstInverter.model}`,
    gridType: site.gridType,
    mountingType: site.mountingType,
    structureMaterial: structure.material,
    earthRodCount: project.earthing.rodCount,
  };

  return { ok: true, input, meta };
}
