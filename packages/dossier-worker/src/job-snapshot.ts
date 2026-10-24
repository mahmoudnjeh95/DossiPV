import { parseRoofOutline, parseSiteImagePoints, type GpsPoint, type RunEngineInput, type SiteImagePoints } from '@dossipv/engine';
import type { ProjectMeta } from './placeholder-map';

export interface SnapshotSite {
  gpsLat: number;
  gpsLon: number;
  tiltDeg: number | null;
  /** PVGIS aspect convention: 0 = south. */
  azimuthDeg: number | null;
  /** Where the array actually stands; PVGIS runs here when set, else at gpsLat/gpsLon. */
  installationPointLat: number | null;
  installationPointLon: number | null;
  floors: number | null;
  technicalRoomPointLat: number | null;
  technicalRoomPointLon: number | null;
  meterPointLat: number | null;
  meterPointLon: number | null;
  earthPitPointLat: number | null;
  earthPitPointLon: number | null;
  /** The roof contour drawn on the Emplacements map; null when none was drawn (or older snapshots). */
  roofOutline: GpsPoint[] | null;
  /** The installer's own satellite photo (a File id) and the points and roof placed again on it. */
  siteImageFileId: string | null;
  siteImagePoints: SiteImagePoints | null;
}

export interface SnapshotClient {
  fullName: string;
  address: string | null;
  stegReference: string | null;
  cin: string | null;
  annualConsumptionKWh: number | null;
  subscribedPowerKVA: number | null;
}

/** The consumption the dossier states; BILL figures are only set when the bill is the source. */
export interface SnapshotConsumption {
  annualConsumptionKWh: number;
  source: 'BILL' | 'MANUAL';
  billedKWh: number | null;
  monthsBilled: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface SnapshotEquipmentRef {
  brand: string;
  model: string;
  datasheetFileId?: string | null;
  homologationFileId?: string | null;
}

export interface SnapshotArrayConfig {
  module: SnapshotEquipmentRef & Record<string, unknown>;
  inverters: {
    inverter: SnapshotEquipmentRef & Record<string, unknown>;
    mppts: { stringsInParallel: number; modulesPerString: number }[];
  }[];
}

export interface SnapshotProtections {
  dcSwitch?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  dcSpd?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  dcFuse?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  acBreaker?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  acSpd?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  acIsolator?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
}

export interface SnapshotStructure {
  material: string;
  frameCount: number | null;
  [key: string]: unknown;
}

export interface SnapshotEarthing {
  rodCount: number;
  /** Absent in snapshots saved before the building-earth option existed (= dedicated rod). */
  useBuildingEarth?: boolean;
  rodLengthM: number;
  mainEarthSectionMm2: number;
  frameEarthSectionMm2: number;
  earthToPitSectionMm2: number;
  targetResistanceOhm: number;
  earthCable?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  distributionBlock?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  [key: string]: unknown;
}

export interface SnapshotCablingConfig {
  connector?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  cableTray?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
}

export interface WorkerJobSnapshot {
  version: 1;
  projectId: string;
  companyId: string;
  tier: 'STANDARD' | 'PREMIUM';
  /** The dossier gets the 3D view of the array on the roof (annex N°5, sheet 2). */
  with3d: boolean;
  dossierNumber: string | null;
  dossierDate: string | null;
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
  client: SnapshotClient | null;
  consumption: SnapshotConsumption | null;
  cableRuns: {
    label: string;
    sectionMm2: number;
    lengthM: number;
    installMethod: string;
    /** 'DC' | 'AC' (ProjectCableRun.circuitType); absent from older test snapshots. */
    circuitType?: string;
    cable?: SnapshotEquipmentRef & Record<string, unknown>;
  }[];
  site: SnapshotSite | null;
  arrayConfig: SnapshotArrayConfig | null;
  protections: SnapshotProtections | null;
  structure: SnapshotStructure | null;
  earthing: SnapshotEarthing | null;
  cablingConfig: SnapshotCablingConfig | null;
  /** STEG pieces missing when the job was queued: non-empty makes dossier.pdf a watermarked draft. */
  draftMissing: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The non-empty strings of an array; [] for anything else (snapshots queued before the field). */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
}

// Snapshots written before round 2 lack the newer fields; each one parses as null.
function parseClient(value: unknown): SnapshotClient | null {
  if (!isRecord(value) || typeof value.fullName !== 'string') return null;
  return {
    fullName: value.fullName,
    address: optionalString(value.address),
    stegReference: optionalString(value.stegReference),
    cin: optionalString(value.cin),
    annualConsumptionKWh: optionalNumber(value.annualConsumptionKWh),
    subscribedPowerKVA: optionalNumber(value.subscribedPowerKVA),
  };
}

function parseConsumption(value: unknown): SnapshotConsumption | null {
  if (!isRecord(value)) return null;
  const annual = optionalNumber(value.annualConsumptionKWh);
  if (annual === null) return null;
  return {
    annualConsumptionKWh: annual,
    source: value.source === 'BILL' ? 'BILL' : 'MANUAL',
    billedKWh: optionalNumber(value.billedKWh),
    monthsBilled: optionalNumber(value.monthsBilled),
    periodStart: optionalString(value.periodStart),
    periodEnd: optionalString(value.periodEnd),
  };
}

function parseSite(value: unknown): SnapshotSite | null {
  if (!isRecord(value)) return null;
  if (typeof value.gpsLat !== 'number' || typeof value.gpsLon !== 'number') return null;
  const num = optionalNumber;
  return {
    gpsLat: value.gpsLat,
    gpsLon: value.gpsLon,
    tiltDeg: num(value.tiltDeg),
    azimuthDeg: num(value.azimuthDeg),
    installationPointLat: num(value.installationPointLat),
    installationPointLon: num(value.installationPointLon),
    floors: num(value.floors),
    technicalRoomPointLat: num(value.technicalRoomPointLat),
    technicalRoomPointLon: num(value.technicalRoomPointLon),
    meterPointLat: num(value.meterPointLat),
    meterPointLon: num(value.meterPointLon),
    earthPitPointLat: num(value.earthPitPointLat),
    earthPitPointLon: num(value.earthPitPointLon),
    roofOutline: parseRoofOutline(value.roofOutline),
    siteImageFileId: optionalString(value.siteImageFileId),
    siteImagePoints: parseSiteImagePoints(value.siteImagePoints),
  };
}

/**
 * True when projectMeta carries the protection references the dossier text needs. A snapshot
 * queued before those fields existed fails here, at the snapshot step, before any Claude call.
 */
function hasProtectionMeta(meta: Record<string, unknown>): boolean {
  const { protections, acBreakerFunction } = meta;
  if (typeof acBreakerFunction !== 'string' || !isRecord(protections)) {
    return false;
  }
  const required = ['dcSwitch', 'dcSpd', 'acBreaker', 'acSpd'];
  return (
    required.every((key) => typeof protections[key] === 'string') &&
    (protections.dcFuse === null || typeof protections.dcFuse === 'string')
  );
}

export function parseJobSnapshot(value: unknown): WorkerJobSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.version !== 1) {
    return null;
  }
  if (typeof value.projectId !== 'string' || typeof value.companyId !== 'string') {
    return null;
  }
  if (!isRecord(value.engineInput) || !isRecord(value.projectMeta)) {
    return null;
  }
  if (!hasProtectionMeta(value.projectMeta)) {
    return null;
  }
  if (!Array.isArray(value.cableRuns)) {
    return null;
  }
  const tier = value.tier === 'PREMIUM' ? 'PREMIUM' : 'STANDARD';

  return {
    version: 1,
    projectId: value.projectId,
    companyId: value.companyId,
    tier,
    // Snapshots queued before the flag existed: the 3D view went with Premium.
    with3d: typeof value.with3d === 'boolean' ? value.with3d : tier === 'PREMIUM',
    dossierNumber: optionalString(value.dossierNumber),
    dossierDate: optionalString(value.dossierDate),
    engineInput: value.engineInput as unknown as RunEngineInput,
    projectMeta: value.projectMeta as unknown as ProjectMeta,
    client: parseClient(value.client),
    consumption: parseConsumption(value.consumption),
    cableRuns: value.cableRuns as WorkerJobSnapshot['cableRuns'],
    site: parseSite(value.site),
    arrayConfig: optionalRecord(value.arrayConfig) as unknown as SnapshotArrayConfig | null,
    protections: optionalRecord(value.protections) as unknown as SnapshotProtections | null,
    structure: optionalRecord(value.structure) as unknown as SnapshotStructure | null,
    earthing: optionalRecord(value.earthing) as unknown as SnapshotEarthing | null,
    cablingConfig: optionalRecord(value.cablingConfig) as unknown as SnapshotCablingConfig | null,
    draftMissing: stringList(value.draftMissing),
  };
}
