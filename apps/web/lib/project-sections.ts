import type { ProjectForEngine } from './project-engine-input';

export type SectionKey =
  | 'client'
  | 'site'
  | 'array'
  | 'protections'
  | 'cabling'
  | 'structure'
  | 'earthing'
  | 'simulation'
  | 'map'
  | 'annexes';

export interface SectionStatus {
  key: SectionKey;
  label: string;
  href: string;
  complete: boolean;
  /** Short French summary shown next to the section when complete. */
  summary: string | null;
}

/**
 * Which sections of the project form are done, in the order the installer should fill them.
 * Pure so the overview page and its tests share one definition.
 */
export function computeSectionStatuses(project: ProjectForEngine): SectionStatus[] {
  const base = `/projects/${project.id}`;
  const moduleCount = project.arrayConfig
    ? project.arrayConfig.inverters.reduce(
        (total, inv) => total + inv.mppts.reduce((sub, mppt) => sub + mppt.stringsInParallel * mppt.modulesPerString, 0),
        0,
      )
    : 0;
  const hasDcRun = project.cableRuns.some((run) => run.circuitType === 'DC');
  const hasAcRun = project.cableRuns.some((run) => run.circuitType === 'AC');

  return [
    {
      key: 'client',
      label: 'Client',
      href: `${base}/sections/client`,
      complete: project.client !== null && project.client.stegReference !== null && project.client.address !== null,
      summary: project.client ? project.client.fullName : null,
    },
    {
      key: 'site',
      label: 'Site',
      href: `${base}/sections/site`,
      complete: project.site !== null,
      summary: project.site ? `${project.site.phases === 3 ? 'Triphasé' : 'Monophasé'}, ${project.site.tiltDeg}°` : null,
    },
    {
      key: 'map',
      label: 'Carte et repères',
      href: `${base}/map`,
      complete: project.site !== null && project.site.meterPointLat !== null,
      summary: project.site?.meterPointLat !== null && project.site?.meterPointLat !== undefined ? 'Repères placés' : null,
    },
    {
      key: 'array',
      label: 'Champ PV',
      href: `${base}/sections/array`,
      complete: project.arrayConfig !== null && project.arrayConfig.inverters.length > 0,
      summary: project.arrayConfig
        ? `${moduleCount} modules ${project.arrayConfig.module.brand} ${project.arrayConfig.module.model}, ${project.arrayConfig.inverters.length} onduleur(s)`
        : null,
    },
    {
      key: 'protections',
      label: 'Protections',
      href: `${base}/sections/protections`,
      complete: project.protections !== null,
      summary: project.protections ? `Disjoncteur AC ${project.protections.acBreaker.ratedCurrentA} A` : null,
    },
    {
      key: 'cabling',
      label: 'Câblage',
      href: `${base}/sections/cabling`,
      complete: project.cablingConfig !== null && hasDcRun && hasAcRun,
      summary: project.cablingConfig ? `${project.cableRuns.length} liaison(s)` : null,
    },
    {
      key: 'structure',
      label: 'Structure',
      href: `${base}/sections/structure`,
      complete: project.structure !== null,
      summary: project.structure
        ? `${project.structure.material} · ${project.structure.windSpeedKmh} km/h`
        : null,
    },
    {
      key: 'earthing',
      label: 'Mise à la terre',
      href: `${base}/sections/earthing`,
      complete: project.earthing !== null,
      summary: project.earthing ? `${project.earthing.rodCount} piquet(s)` : null,
    },
    {
      key: 'simulation',
      label: 'Simulation de production',
      href: `${base}/sections/simulation`,
      complete: project.simulation !== null,
      summary: project.simulation ? (project.simulation.source === 'PVSYST_UPLOAD' ? 'Rapport PVsyst' : 'PVGIS automatique') : null,
    },
    {
      key: 'annexes',
      // Optional: never blocks generation (not consumed by the engine), only merged into the
      // final PDF's annex pages if present — always shown "complete" so it never appears as a
      // missing required section.
      label: 'Annexes',
      href: `${base}/sections/annexes`,
      complete: true,
      summary: annexesSummary(project.annexes),
    },
  ];
}

function annexesSummary(annexes: ProjectForEngine['annexes']): string | null {
  if (!annexes) {
    return null;
  }
  const count =
    (annexes.cinFileId !== null ? 1 : 0) +
    (annexes.commercialRegisterFileId !== null ? 1 : 0) +
    (annexes.stegContractFileId !== null ? 1 : 0) +
    (annexes.lastPaidBillFileId !== null ? 1 : 0) +
    (annexes.moduleAcceptanceFileId !== null ? 1 : 0) +
    annexes.extraFiles.length;
  return count > 0 ? `${count} fichier(s)` : null;
}
