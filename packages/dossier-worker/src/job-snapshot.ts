import type { RunEngineInput } from '@dossipv/engine';
import type { ProjectMeta } from './placeholder-map';

export interface WorkerJobSnapshot {
  version: 1;
  projectId: string;
  companyId: string;
  engineInput: RunEngineInput;
  projectMeta: ProjectMeta;
  client: { fullName: string; address: string | null; stegReference: string | null } | null;
  cableRuns: { label: string; sectionMm2: number; lengthM: number; installMethod: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  // client is allowed to be null (a project with no client section filled in yet would never
  // reach this point in practice — the generate action already requires it — but this parser
  // stays defensive rather than assuming).
  const client = value.client === null ? null : isRecord(value.client) ? (value.client as WorkerJobSnapshot['client']) : null;

  return {
    version: 1,
    projectId: value.projectId,
    companyId: value.companyId,
    engineInput: value.engineInput as unknown as RunEngineInput,
    projectMeta: value.projectMeta as unknown as ProjectMeta,
    client,
    cableRuns: value.cableRuns as WorkerJobSnapshot['cableRuns'],
  };
}
