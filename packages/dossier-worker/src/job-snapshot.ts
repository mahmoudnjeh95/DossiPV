import type { RunEngineInput } from '@dossipv/engine';
import type { ProjectMeta } from './placeholder-map';

export interface SnapshotSite {
  gpsLat: number;
  gpsLon: number;
  technicalRoomPointLat: number | null;
  technicalRoomPointLon: number | null;
  meterPointLat: number | null;
  meterPointLon: number | null;
  earthPitPointLat: number | null;
  earthPitPointLon: number | null;
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
  frameCount: number;
  [key: string]: unknown;
}

export interface SnapshotEarthing {
  rodCount: number;
  earthCable?: (SnapshotEquipmentRef & Record<string, unknown>) | null;
  [key: string]: unknown;
}

export interface WorkerJobSnapshot {
  version: 1;
  projectId: string;
  companyId: string;
  tier: 'STANDARD' | 'PREMIUM';
  dossierNumber: string | null;
  dossierDate: string | null;
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
  client: { fullName: string; address: string | null; stegReference: string | null } | null;
  cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string; cable?: SnapshotEquipmentRef & Record<string, unknown> }[];
  site: SnapshotSite | null;
  arrayConfig: SnapshotArrayConfig | null;
  protections: SnapshotProtections | null;
  structure: SnapshotStructure | null;
  earthing: SnapshotEarthing | null;
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

function parseSite(value: unknown): SnapshotSite | null {
  if (!isRecord(value)) return null;
  if (typeof value.gpsLat !== 'number' || typeof value.gpsLon !== 'number') return null;
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    gpsLat: value.gpsLat,
    gpsLon: value.gpsLon,
    technicalRoomPointLat: num(value.technicalRoomPointLat),
    technicalRoomPointLon: num(value.technicalRoomPointLon),
    meterPointLat: num(value.meterPointLat),
    meterPointLon: num(value.meterPointLon),
    earthPitPointLat: num(value.earthPitPointLat),
    earthPitPointLon: num(value.earthPitPointLon),
  };
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
  if (!Array.isArray(value.cableRuns)) {
    return null;
  }
  const client = value.client === null ? null : isRecord(value.client) ? (value.client as WorkerJobSnapshot['client']) : null;
  const tier = value.tier === 'PREMIUM' ? 'PREMIUM' : 'STANDARD';

  return {
    version: 1,
    projectId: value.projectId,
    companyId: value.companyId,
    tier,
    dossierNumber: optionalString(value.dossierNumber),
    dossierDate: optionalString(value.dossierDate),
    engineInput: value.engineInput as unknown as RunEngineInput,
    projectMeta: value.projectMeta as unknown as ProjectMeta,
    client,
    cableRuns: value.cableRuns as WorkerJobSnapshot['cableRuns'],
    site: parseSite(value.site),
    arrayConfig: optionalRecord(value.arrayConfig) as unknown as SnapshotArrayConfig | null,
    protections: optionalRecord(value.protections) as unknown as SnapshotProtections | null,
    structure: optionalRecord(value.structure) as unknown as SnapshotStructure | null,
    earthing: optionalRecord(value.earthing) as unknown as SnapshotEarthing | null,
  };
}
