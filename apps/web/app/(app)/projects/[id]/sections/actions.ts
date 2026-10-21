'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireAuthenticatedCompanyUser } from '../../../layout';
import { equipmentChoiceScope, isClientIdentityLocked } from '../../../../../lib/project-access';
import { FormReader } from '../../../../../lib/form-reader';
import {
  CIVILITY_OPTIONS,
  CLIENT_KIND_OPTIONS,
  STRUCTURE_MATERIAL_OPTIONS,
  SIMULATION_SOURCE_OPTIONS,
  PHASE_CONNECTION_OPTIONS,
  INSTALL_METHOD_OPTIONS,
  AMBIENT_CONTEXT_OPTIONS,
  CABLE_SECTION_OPTIONS,
} from '../../../../../lib/labels';

export interface SectionActionState {
  error: string;
}

const values = (options: { value: string }[]): string[] => options.map((o) => o.value);

async function requireOwnedProjectId(projectId: string): Promise<{ companyId: string } | null> {
  const user = await requireAuthenticatedCompanyUser();
  const project = await db.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { id: true } });
  return project ? { companyId: user.companyId } : null;
}

function done(projectId: string, section: string): never {
  redirect(`/projects/${projectId}?saved=${section}`);
  return undefined as never;
}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

export async function saveClientAction(
  projectId: string,
  _prev: SectionActionState | undefined,
  formData: FormData,
): Promise<SectionActionState | undefined> {
  const owned = await requireOwnedProjectId(projectId);
  if (!owned) {
    return { error: 'Projet introuvable.' };
  }

  const reader = new FormReader(formData);
  const locked = await isClientIdentityLocked(projectId);
  const existing = await db.projectClient.findUnique({ where: { projectId } });

  // Spec §5: name and STEG reference lock after first generation — ignore any submitted change.
  const fullName = locked && existing ? existing.fullName : reader.text('fullName', 'Nom du client', 200);
  const stegReference = locked && existing ? existing.stegReference : reader.optionalText('stegReference', 'Référence STEG', 100);

  const data = {
    fullName,
    stegReference,
    civility: reader.optionalOneOf('civility', 'Civilité', values(CIVILITY_OPTIONS)),
    clientKind: reader.oneOf('clientKind', 'Type de client', values(CLIENT_KIND_OPTIONS)),
    cin: reader.optionalText('cin', 'CIN', 20),
    commercialRegister: reader.optionalText('commercialRegister', 'Registre de commerce', 50),
    phone: reader.optionalText('phone', 'Téléphone', 30),
    address: reader.optionalText('address', 'Adresse', 300),
    city: reader.optionalText('city', 'Ville', 100),
    governorate: reader.optionalText('governorate', 'Gouvernorat', 100),
    annualConsumptionKWh: reader.optionalNumber('annualConsumptionKWh', 'Consommation annuelle', { min: 0 }),
    subscribedPowerKVA: reader.optionalNumber('subscribedPowerKVA', 'Puissance souscrite', { min: 0 }),
  };
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  await db.projectClient.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
  return done(projectId, 'client');
}

// ---------------------------------------------------------------------------------------------
// Site
// ---------------------------------------------------------------------------------------------

export async function saveSiteAction(
  projectId: string,
  _prev: SectionActionState | undefined,
  formData: FormData,
): Promise<SectionActionState | undefined> {
  const owned = await requireOwnedProjectId(projectId);
  if (!owned) {
    return { error: 'Projet introuvable.' };
  }

  const reader = new FormReader(formData);
  // The form asks only for what the engine and simulation use. Grid type and mounting type take
  // defaults on create; the other site columns (roof, shading, generator, ...) are left untouched.
  const data = {
    gpsLat: reader.number('gpsLat', 'Latitude', { min: -90, max: 90 }),
    gpsLon: reader.number('gpsLon', 'Longitude', { min: -180, max: 180 }),
    phases: reader.integer('phases', 'Phases', { min: 1, max: 3 }),
    tiltDeg: reader.number('tiltDeg', 'Inclinaison', { min: 0, max: 90 }),
    azimuthDeg: reader.optionalNumber('azimuthDeg', 'Azimut', { min: -180, max: 360 }),
    lightningRod: reader.boolean('lightningRod'),
  };
  if (data.phases !== 1 && data.phases !== 3) {
    reader.errors.push('Phases : choisir monophasé ou triphasé.');
  }
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  // Pins (meter, technical room, earth pit) are owned by the map editor and are deliberately
  // left untouched on update.
  await db.projectSite.upsert({
    where: { projectId },
    create: { projectId, gridType: 'BT', mountingType: 'FLAT_ROOF_BALLAST', ...data },
    update: data,
  });
  return done(projectId, 'site');
}

// ---------------------------------------------------------------------------------------------
// Array (module + inverters + MPPTs) — structured payload from the client component
// ---------------------------------------------------------------------------------------------

export interface ArrayPayload {
  moduleId: string;
  tMinC: number;
  tMaxC: number;
  rowsDescription: string | null;
  inverters: { inverterId: string; phaseConnection: string | null; mppts: { stringsInParallel: number; modulesPerString: number }[] }[];
}

const MAX_INVERTERS = 20;
const MAX_MPPTS = 12;

function isPositiveInt(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
}

export async function saveArrayAction(projectId: string, payload: ArrayPayload): Promise<SectionActionState | undefined> {
  const owned = await requireOwnedProjectId(projectId);
  if (!owned) {
    return { error: 'Projet introuvable.' };
  }

  if (typeof payload.moduleId !== 'string' || !Number.isFinite(payload.tMinC) || !Number.isFinite(payload.tMaxC)) {
    return { error: 'Données du champ PV invalides.' };
  }
  if (payload.tMinC >= payload.tMaxC || payload.tMinC < -50 || payload.tMaxC > 120) {
    return { error: 'Températures : Tmin doit être inférieure à Tmax (plage -50 °C à 120 °C).' };
  }
  if (!Array.isArray(payload.inverters) || payload.inverters.length === 0 || payload.inverters.length > MAX_INVERTERS) {
    return { error: 'Au moins un onduleur est requis.' };
  }
  const phaseConnections = values(PHASE_CONNECTION_OPTIONS);
  for (const inv of payload.inverters) {
    if (typeof inv.inverterId !== 'string') {
      return { error: 'Onduleur invalide.' };
    }
    if (inv.phaseConnection !== null && !phaseConnections.includes(inv.phaseConnection)) {
      return { error: 'Raccordement de phase invalide.' };
    }
    if (!Array.isArray(inv.mppts) || inv.mppts.length === 0 || inv.mppts.length > MAX_MPPTS) {
      return { error: 'Chaque onduleur doit avoir au moins un MPPT.' };
    }
    for (const mppt of inv.mppts) {
      if (!isPositiveInt(mppt.stringsInParallel, 50) || !isPositiveInt(mppt.modulesPerString, 100)) {
        return { error: 'Nombre de chaînes ou de modules par chaîne invalide.' };
      }
    }
  }

  const saved = await db.projectArrayConfig.findUnique({
    where: { projectId },
    select: { moduleId: true, inverters: { select: { inverterId: true } } },
  });
  const module = await db.pvModule.findFirst({
    where: { id: payload.moduleId, ...equipmentChoiceScope(owned.companyId, saved ? [saved.moduleId] : []) },
    select: { id: true },
  });
  if (!module) {
    return { error: 'Module introuvable dans votre bibliothèque.' };
  }
  const inverterIds = [...new Set(payload.inverters.map((inv) => inv.inverterId))];
  const inverters = await db.inverter.findMany({
    where: { id: { in: inverterIds }, ...equipmentChoiceScope(owned.companyId, saved?.inverters.map((i) => i.inverterId) ?? []) },
    select: { id: true, mpptCount: true },
  });
  if (inverters.length !== inverterIds.length) {
    return { error: 'Onduleur introuvable dans votre bibliothèque.' };
  }
  for (const inv of payload.inverters) {
    const spec = inverters.find((i) => i.id === inv.inverterId)!;
    if (inv.mppts.length > spec.mpptCount) {
      return { error: `L'onduleur sélectionné n'a que ${spec.mpptCount} MPPT.` };
    }
  }

  const rowsDescription = typeof payload.rowsDescription === 'string' && payload.rowsDescription.length > 0 ? payload.rowsDescription.slice(0, 500) : null;

  await db.$transaction(async (tx) => {
    const existing = await tx.projectArrayConfig.findUnique({ where: { projectId }, select: { id: true } });
    if (existing) {
      await tx.projectArrayMppt.deleteMany({ where: { arrayInverter: { arrayConfigId: existing.id } } });
      await tx.projectArrayInverter.deleteMany({ where: { arrayConfigId: existing.id } });
      await tx.projectArrayConfig.delete({ where: { id: existing.id } });
    }
    await tx.projectArrayConfig.create({
      data: {
        projectId,
        moduleId: payload.moduleId,
        tMinC: payload.tMinC,
        tMaxC: payload.tMaxC,
        rowsDescription,
        inverters: {
          create: payload.inverters.map((inv) => ({
            inverterId: inv.inverterId,
            phaseConnection: inv.phaseConnection,
            mppts: { create: inv.mppts.map((m) => ({ stringsInParallel: m.stringsInParallel, modulesPerString: m.modulesPerString })) },
          })),
        },
      },
    });
  });

  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Protections
// ---------------------------------------------------------------------------------------------

export async function saveProtectionsAction(
  projectId: string,
  _prev: SectionActionState | undefined,
  formData: FormData,
): Promise<SectionActionState | undefined> {
  const owned = await requireOwnedProjectId(projectId);
  if (!owned) {
    return { error: 'Projet introuvable.' };
  }

  const reader = new FormReader(formData);
  const dcSpdId = reader.text('dcSpdId', 'Parafoudre DC', 100);
  const dcSwitchId = reader.text('dcSwitchId', 'Interrupteur-sectionneur DC', 100);
  const dcFuseId = reader.optionalText('dcFuseId', 'Fusible DC', 100);
  const acBreakerId = reader.text('acBreakerId', 'Disjoncteur AC', 100);
  const acSpdId = reader.text('acSpdId', 'Parafoudre AC', 100);
  const acIsolatorId = reader.optionalText('acIsolatorId', 'Interrupteur-sectionneur AC', 100);
  // Only the equipment picks are asked. SPD distance / impulse withstand use the schema defaults
  // (1 m, 4 kV) and the main-breaker figures are unused, so none of them are touched here.
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  const saved = await db.projectProtections.findUnique({ where: { projectId } });
  const choice = (savedId: string | null | undefined): ReturnType<typeof equipmentChoiceScope> =>
    equipmentChoiceScope(owned.companyId, savedId ? [savedId] : []);
  const [dcSpd, dcSwitch, dcFuse, acBreaker, acSpd, acIsolator] = await Promise.all([
    db.spd.findFirst({ where: { id: dcSpdId, side: 'DC', ...choice(saved?.dcSpdId) }, select: { id: true } }),
    db.dcSwitch.findFirst({ where: { id: dcSwitchId, ...choice(saved?.dcSwitchId) }, select: { id: true } }),
    dcFuseId ? db.dcFuse.findFirst({ where: { id: dcFuseId, ...choice(saved?.dcFuseId) }, select: { id: true } }) : Promise.resolve(null),
    db.acBreaker.findFirst({ where: { id: acBreakerId, ...choice(saved?.acBreakerId) }, select: { id: true } }),
    db.spd.findFirst({ where: { id: acSpdId, side: 'AC', ...choice(saved?.acSpdId) }, select: { id: true } }),
    acIsolatorId ? db.acIsolator.findFirst({ where: { id: acIsolatorId, ...choice(saved?.acIsolatorId) }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (!dcSpd || !dcSwitch || !acBreaker || !acSpd || (dcFuseId && !dcFuse) || (acIsolatorId && !acIsolator)) {
    return { error: 'Un équipement sélectionné est introuvable dans votre bibliothèque.' };
  }

  const full = { dcSpdId, dcSwitchId, dcFuseId, acBreakerId, acSpdId, acIsolatorId };
  await db.projectProtections.upsert({ where: { projectId }, create: { projectId, ...full }, update: full });
  return done(projectId, 'protections');
}

// ---------------------------------------------------------------------------------------------
// Cabling (config + runs) — structured payload from the client component
// ---------------------------------------------------------------------------------------------

export interface CablingPayload {
  cosPhi: number;
  lambdaOhmPerM: number;
  maxVoltageDropPct: number;
  connectorId: string | null;
  cableTrayId: string | null;
  runs: {
    circuitType: 'DC' | 'AC';
    label: string;
    cableId: string;
    sectionMm2: number;
    lengthM: number;
    installMethod: string;
    ambientContext: string;
    groupedCircuits: number;
    layers: number;
  }[];
}

const MAX_RUNS = 40;

export async function saveCablingAction(projectId: string, payload: CablingPayload): Promise<SectionActionState | undefined> {
  const owned = await requireOwnedProjectId(projectId);
  if (!owned) {
    return { error: 'Projet introuvable.' };
  }

  if (!Number.isFinite(payload.cosPhi) || payload.cosPhi <= 0 || payload.cosPhi > 1) {
    return { error: 'cos φ doit être compris entre 0 et 1.' };
  }
  if (!Number.isFinite(payload.lambdaOhmPerM) || payload.lambdaOhmPerM < 0) {
    return { error: 'Réactance linéique λ invalide.' };
  }
  if (!Number.isFinite(payload.maxVoltageDropPct) || payload.maxVoltageDropPct <= 0 || payload.maxVoltageDropPct > 20) {
    return { error: 'Chute de tension maximale invalide (0–20 %).' };
  }
  if (!Array.isArray(payload.runs) || payload.runs.length === 0 || payload.runs.length > MAX_RUNS) {
    return { error: 'Au moins une liaison DC et une liaison AC sont requises.' };
  }
  if (!payload.runs.some((r) => r.circuitType === 'DC') || !payload.runs.some((r) => r.circuitType === 'AC')) {
    return { error: 'Au moins une liaison DC et une liaison AC sont requises.' };
  }
  const installMethods = values(INSTALL_METHOD_OPTIONS);
  const ambientContexts = values(AMBIENT_CONTEXT_OPTIONS);
  for (const run of payload.runs) {
    if (run.circuitType !== 'DC' && run.circuitType !== 'AC') {
      return { error: 'Type de circuit invalide.' };
    }
    if (typeof run.label !== 'string' || run.label.trim().length === 0 || run.label.length > 100) {
      return { error: 'Chaque liaison doit avoir un libellé.' };
    }
    if (typeof run.cableId !== 'string') {
      return { error: 'Câble invalide.' };
    }
    if (!CABLE_SECTION_OPTIONS.includes(run.sectionMm2)) {
      return { error: `Section ${String(run.sectionMm2)} mm² invalide.` };
    }
    if (!Number.isFinite(run.lengthM) || run.lengthM <= 0 || run.lengthM > 10000) {
      return { error: 'Longueur de liaison invalide.' };
    }
    if (!installMethods.includes(run.installMethod)) {
      return { error: 'Mode de pose invalide.' };
    }
    if (!ambientContexts.includes(run.ambientContext)) {
      return { error: 'Contexte ambiant invalide.' };
    }
    if (!isPositiveInt(run.groupedCircuits, 50) || !isPositiveInt(run.layers, 20)) {
      return { error: 'Nombre de circuits groupés ou de couches invalide.' };
    }
  }

  const [savedConfig, savedRuns] = await Promise.all([
    db.projectCablingConfig.findUnique({ where: { projectId }, select: { connectorId: true, cableTrayId: true } }),
    db.projectCableRun.findMany({ where: { projectId }, select: { cableId: true } }),
  ]);
  const cableIds = [...new Set(payload.runs.map((r) => r.cableId))];
  const cables = await db.cable.findMany({
    where: { id: { in: cableIds }, ...equipmentChoiceScope(owned.companyId, savedRuns.map((r) => r.cableId)) },
    include: { sections: true },
  });
  if (cables.length !== cableIds.length) {
    return { error: 'Câble introuvable dans votre bibliothèque.' };
  }
  for (const run of payload.runs) {
    const cable = cables.find((c) => c.id === run.cableId)!;
    const expectedUsage = run.circuitType === 'DC' ? 'DC_SOLAR' : 'AC';
    if (cable.usage !== expectedUsage) {
      return { error: `Le câble ${cable.brand} ${cable.model} n'est pas un câble ${run.circuitType}.` };
    }
    if (!cable.sections.some((s) => s.sectionMm2 === run.sectionMm2)) {
      return { error: `La section ${run.sectionMm2} mm² n'existe pas pour le câble ${cable.brand} ${cable.model}.` };
    }
  }
  if (payload.connectorId !== null && typeof payload.connectorId !== 'string') {
    return { error: 'Connecteur invalide.' };
  }
  if (payload.cableTrayId !== null && typeof payload.cableTrayId !== 'string') {
    return { error: 'Chemin de câbles invalide.' };
  }
  const [connector, cableTray] = await Promise.all([
    payload.connectorId ? db.accessory.findFirst({ where: { id: payload.connectorId, kind: 'MC4_CONNECTOR', ...equipmentChoiceScope(owned.companyId, savedConfig?.connectorId ? [savedConfig.connectorId] : []) }, select: { id: true } }) : Promise.resolve(null),
    payload.cableTrayId ? db.accessory.findFirst({ where: { id: payload.cableTrayId, kind: 'CABLE_TRAY', ...equipmentChoiceScope(owned.companyId, savedConfig?.cableTrayId ? [savedConfig.cableTrayId] : []) }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if ((payload.connectorId && !connector) || (payload.cableTrayId && !cableTray)) {
    return { error: 'Accessoire introuvable dans votre bibliothèque.' };
  }

  const config = {
    cosPhi: payload.cosPhi,
    lambdaOhmPerM: payload.lambdaOhmPerM,
    maxVoltageDropPct: payload.maxVoltageDropPct,
    connectorId: payload.connectorId,
    cableTrayId: payload.cableTrayId,
  };

  await db.$transaction(async (tx) => {
    await tx.projectCablingConfig.upsert({ where: { projectId }, create: { projectId, ...config }, update: config });
    await tx.projectCableRun.deleteMany({ where: { projectId } });
    await tx.projectCableRun.createMany({
      data: payload.runs.map((run) => ({
        projectId,
        circuitType: run.circuitType,
        label: run.label.trim(),
        cableId: run.cableId,
        sectionMm2: run.sectionMm2,
        lengthM: run.lengthM,
        installMethod: run.installMethod,
        ambientContext: run.ambientContext,
        groupedCircuits: run.groupedCircuits,
        layers: run.layers,
      })),
    });
  });

  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------------------------

export async function saveStructureAction(
  projectId: string,
  _prev: SectionActionState | undefined,
  formData: FormData,
): Promise<SectionActionState | undefined> {
  const owned = await requireOwnedProjectId(projectId);
  if (!owned) {
    return { error: 'Projet introuvable.' };
  }

  const reader = new FormReader(formData);
  // Tunisian dossiers need only the material and the design wind speed. The other structure
  // columns stay optional in the schema; they are cleared on save so a project saved from this
  // form never carries stale wind-stability inputs (the engine then skips the stability check).
  const data = {
    material: reader.oneOf('material', 'Matériau', values(STRUCTURE_MATERIAL_OPTIONS)),
    windSpeedKmh: reader.number('windSpeedKmh', 'Vitesse de vent', { min: 0, max: 400 }),
    frameDescription: null,
    frameCount: null,
    railsDescription: null,
    fixingDescription: null,
    ballastPerFrame: null,
    ballastMassKg: null,
    ballastType: null,
    structureWeightN: null,
    heightHM: null,
    depthDM: null,
    liftCoeffNPerM2: null,
    dragCoeffNPerM2: null,
    tieDownCables: null,
  };
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  await db.projectStructure.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
  return done(projectId, 'structure');
}

// ---------------------------------------------------------------------------------------------
// Earthing
// ---------------------------------------------------------------------------------------------

export async function saveEarthingAction(
  projectId: string,
  _prev: SectionActionState | undefined,
  formData: FormData,
): Promise<SectionActionState | undefined> {
  const owned = await requireOwnedProjectId(projectId);
  if (!owned) {
    return { error: 'Projet introuvable.' };
  }

  const reader = new FormReader(formData);
  const earthCableId = reader.text('earthCableId', 'Câble de terre', 100);
  // Installers enter only the earth cable and rod count; the rest are standard values (none feed
  // the engine). The target resistance comes from the form's hidden field (company default) or a
  // visible input when the company has no default.
  const distributionBlockId = null;
  const data = {
    mainEarthSectionMm2: 16,
    frameEarthSectionMm2: 16,
    earthToPitSectionMm2: 25,
    rodCount: reader.integer('rodCount', 'Nombre de piquets', { min: 1, max: 100 }),
    rodLengthM: 1.5,
    rodSpacingCm: null,
    pitSizeCm: null,
    targetResistanceOhm: reader.number('targetResistanceOhm', 'Résistance cible', { min: 0, max: 1000 }),
  };
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  const saved = await db.projectEarthing.findUnique({ where: { projectId }, select: { earthCableId: true, distributionBlockId: true } });
  const [cable, block] = await Promise.all([
    db.cable.findFirst({ where: { id: earthCableId, usage: 'EARTH', ...equipmentChoiceScope(owned.companyId, saved ? [saved.earthCableId] : []) }, select: { id: true } }),
    distributionBlockId
      ? db.accessory.findFirst({ where: { id: distributionBlockId, kind: 'DISTRIBUTION_BLOCK', ...equipmentChoiceScope(owned.companyId, saved?.distributionBlockId ? [saved.distributionBlockId] : []) }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!cable || (distributionBlockId && !block)) {
    return { error: 'Un équipement sélectionné est introuvable dans votre bibliothèque.' };
  }

  const full = { earthCableId, distributionBlockId, ...data };
  await db.projectEarthing.upsert({ where: { projectId }, create: { projectId, ...full }, update: full });
  return done(projectId, 'earthing');
}

// ---------------------------------------------------------------------------------------------
// Shared file-upload helpers (Simulation's PVsyst report, Annexes' documents)
// ---------------------------------------------------------------------------------------------

interface UploadSuccess {
  storageKey: string;
  mimeType: string;
  fileName: string;
}

interface ValidatedFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

/** Reads and validates a field's file (if present) without writing anything to disk yet. */
async function validateFileField(formData: FormData, fieldName: string): Promise<ValidatedFile | null | { error: string }> {
  const field = formData.get(fieldName);
  if (!(field instanceof File) || field.size === 0) {
    return null;
  }
  const buffer = Buffer.from(await field.arrayBuffer());
  const validation = validateUploadedFile(buffer, field.type, field.size);
  if (!validation.valid) {
    return { error: validation.error };
  }
  return { buffer, mimeType: validation.mimeType, fileName: field.name };
}

async function saveValidatedFile(validated: ValidatedFile): Promise<UploadSuccess> {
  const { storageKey } = await saveFile(validated.buffer, validated.fileName, validated.mimeType);
  return { storageKey, mimeType: validated.mimeType, fileName: validated.fileName };
}

// ---------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------

export async function saveSimulationAction(
  projectId: string,
  _prev: SectionActionState | undefined,
  formData: FormData,
): Promise<SectionActionState | undefined> {
  const owned = await requireOwnedProjectId(projectId);
  if (!owned) {
    return { error: 'Projet introuvable.' };
  }

  const existing = await db.projectSimulation.findUnique({ where: { projectId }, select: { pvsystReportFileId: true } });

  const reader = new FormReader(formData);
  const data = {
    source: reader.oneOf('source', 'Source', values(SIMULATION_SOURCE_OPTIONS)),
    annualProductionKWh: reader.optionalNumber('annualProductionKWh', 'Production annuelle', { min: 0 }),
    specificYieldKWhPerKWp: reader.optionalNumber('specificYieldKWhPerKWp', 'Productible spécifique', { min: 0 }),
    performanceRatioPct: reader.optionalNumber('performanceRatioPct', 'Performance ratio', { min: 0, max: 100 }),
    systemLossesPct: reader.optionalNumber('systemLossesPct', 'Pertes système', { min: 0, max: 100 }),
  };
  if (data.source === 'PVSYST_UPLOAD' && data.annualProductionKWh === null) {
    reader.errors.push('Production annuelle : obligatoire lorsque le rapport PVsyst est fourni.');
  }
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  // Validate the report before writing anything to disk, so an earlier mistake in the text
  // fields above (caught by reader.hasErrors) can never leave an orphaned upload behind.
  const validatedReport = await validateFileField(formData, 'pvsystReport');
  if (validatedReport && 'error' in validatedReport) {
    return { error: validatedReport.error };
  }

  let pvsystReportFileId: string | undefined;
  if (validatedReport) {
    const saved = await saveValidatedFile(validatedReport);
    const file = await db.file.create({ data: { fileName: saved.fileName, mimeType: saved.mimeType, storageKey: saved.storageKey } });
    pvsystReportFileId = file.id;
  }

  const fullData = { ...data, ...(pvsystReportFileId ? { pvsystReportFileId } : {}) };
  await db.projectSimulation.upsert({ where: { projectId }, create: { projectId, ...fullData }, update: fullData });

  if (pvsystReportFileId && existing?.pvsystReportFileId) {
    const oldFile = await db.file.findUnique({ where: { id: existing.pvsystReportFileId } });
    if (oldFile) {
      await deleteFile(oldFile.storageKey);
      await db.file.delete({ where: { id: oldFile.id } });
    }
  }

  return done(projectId, 'simulation');
}

// ---------------------------------------------------------------------------------------------
// Annexes
// ---------------------------------------------------------------------------------------------

const ANNEX_FIELDS = ['cin', 'commercialRegister', 'stegContract', 'lastPaidBill'] as const;
const ANNEX_FILE_ID_KEYS = {
  cin: 'cinFileId',
  commercialRegister: 'commercialRegisterFileId',
  stegContract: 'stegContractFileId',
  lastPaidBill: 'lastPaidBillFileId',
} as const;

export async function saveAnnexesAction(
  projectId: string,
  _prev: SectionActionState | undefined,
  formData: FormData,
): Promise<SectionActionState | undefined> {
  const owned = await requireOwnedProjectId(projectId);
  if (!owned) {
    return { error: 'Projet introuvable.' };
  }

  const existing = await db.projectAnnexes.findUnique({ where: { projectId } });

  // Phase 1: validate every file (named fields + repeatable extras) with no disk writes yet,
  // so a later field's rejection can never orphan an earlier field's already-saved file.
  const validated: Record<(typeof ANNEX_FIELDS)[number], ValidatedFile | null> = {
    cin: null,
    commercialRegister: null,
    stegContract: null,
    lastPaidBill: null,
  };
  for (const field of ANNEX_FIELDS) {
    const result = await validateFileField(formData, field);
    if (result && 'error' in result) {
      return { error: result.error };
    }
    validated[field] = result;
  }

  const extraFiles = formData.getAll('extraFiles').filter((f): f is File => f instanceof File && f.size > 0);
  const validatedExtraFiles: ValidatedFile[] = [];
  for (const extraFile of extraFiles) {
    const buffer = Buffer.from(await extraFile.arrayBuffer());
    const validation = validateUploadedFile(buffer, extraFile.type, extraFile.size);
    if (!validation.valid) {
      return { error: validation.error };
    }
    validatedExtraFiles.push({ buffer, mimeType: validation.mimeType, fileName: extraFile.name });
  }

  // Phase 2: every file is known-valid — now it's safe to write to disk and create File rows.
  const newFileIds: Partial<Record<string, string>> = {};
  for (const field of ANNEX_FIELDS) {
    const toSave = validated[field];
    if (toSave) {
      const saved = await saveValidatedFile(toSave);
      const file = await db.file.create({ data: { fileName: saved.fileName, mimeType: saved.mimeType, storageKey: saved.storageKey } });
      newFileIds[ANNEX_FILE_ID_KEYS[field]] = file.id;
    }
  }
  const extraFileUploads: UploadSuccess[] = [];
  for (const toSave of validatedExtraFiles) {
    extraFileUploads.push(await saveValidatedFile(toSave));
  }

  await db.$transaction(async (tx) => {
    const annexes = await tx.projectAnnexes.upsert({
      where: { projectId },
      create: { projectId, ...newFileIds },
      update: newFileIds,
    });

    if (extraFileUploads.length > 0) {
      const extraFileRows = await Promise.all(
        extraFileUploads.map((upload) =>
          tx.file.create({ data: { fileName: upload.fileName, mimeType: upload.mimeType, storageKey: upload.storageKey } }),
        ),
      );
      await tx.projectAnnexExtraFile.deleteMany({ where: { annexesId: annexes.id } });
      await tx.projectAnnexExtraFile.createMany({ data: extraFileRows.map((file) => ({ annexesId: annexes.id, fileId: file.id })) });
    }
  });

  for (const field of ANNEX_FIELDS) {
    const newId = newFileIds[ANNEX_FILE_ID_KEYS[field]];
    const oldId = existing?.[ANNEX_FILE_ID_KEYS[field]];
    if (newId && oldId) {
      const oldFile = await db.file.findUnique({ where: { id: oldId } });
      if (oldFile) {
        await deleteFile(oldFile.storageKey);
        await db.file.delete({ where: { id: oldFile.id } });
      }
    }
  }

  return done(projectId, 'annexes');
}
