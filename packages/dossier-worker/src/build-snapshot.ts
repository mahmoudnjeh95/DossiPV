import { db, type Prisma } from '@dossipv/db';

const snapshotInclude = {
  client: true,
  site: true,
  arrayConfig: {
    include: {
      module: true,
      inverters: { include: { inverter: true, mppts: true } },
    },
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
  // Cable, connector, tray, earth cable and distribution block are catalog rows too: captured
  // by value for the same reason as module/inverter/protections (spec §5 step 1 — a later
  // catalog edit, e.g. to a cable section's Iz, must never change an already-generated dossier).
  cablingConfig: { include: { connector: true, cableTray: true } },
  cableRuns: { include: { cable: { include: { sections: true } } } },
  structure: true,
  earthing: { include: { earthCable: { include: { sections: true } }, distributionBlock: true } },
} satisfies Prisma.ProjectInclude;

type ProjectWithSnapshotRelations = Prisma.ProjectGetPayload<{ include: typeof snapshotInclude }>;

export interface ProjectSnapshot {
  client: ProjectWithSnapshotRelations['client'];
  site: ProjectWithSnapshotRelations['site'];
  arrayConfig: ProjectWithSnapshotRelations['arrayConfig'];
  protections: ProjectWithSnapshotRelations['protections'];
  cablingConfig: ProjectWithSnapshotRelations['cablingConfig'];
  cableRuns: ProjectWithSnapshotRelations['cableRuns'];
  structure: ProjectWithSnapshotRelations['structure'];
  earthing: ProjectWithSnapshotRelations['earthing'];
  capturedAt: string;
}

export async function buildProjectSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const project: ProjectWithSnapshotRelations = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: snapshotInclude,
  });

  return {
    client: project.client,
    site: project.site,
    arrayConfig: project.arrayConfig,
    protections: project.protections,
    cablingConfig: project.cablingConfig,
    cableRuns: project.cableRuns,
    structure: project.structure,
    earthing: project.earthing,
    capturedAt: new Date().toISOString(),
  };
}
