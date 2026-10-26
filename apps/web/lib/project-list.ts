import type { Prisma, ProjectFlowStep, ProjectStatus } from '@dossipv/db';

/**
 * Where a project opens from the list: a project created from a bill still choosing its installation
 * reopens on its proposals, one still placing its points on the map; any other on its overview.
 */
export function projectHref(project: { id: string; flowStep: ProjectFlowStep | null }): string {
  if (project.flowStep === 'PROPOSALS') return `/projects/${project.id}/proposals`;
  if (project.flowStep === 'LOCATIONS') return `/projects/${project.id}/locations`;
  return `/projects/${project.id}`;
}

/** The step a draft is waiting on, shown next to its status; null once the steps are done. */
export function projectStepLabel(project: { flowStep: ProjectFlowStep | null; status: ProjectStatus }): string | null {
  if (project.status !== 'DRAFT') return null;
  if (project.flowStep === 'PROPOSALS') return 'installation à choisir';
  if (project.flowStep === 'LOCATIONS') return 'points à placer';
  return null;
}

export const PROJECT_FILTER_STATUSES = [
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'PROPOSALS', label: 'Installation à choisir' },
  { value: 'LOCATIONS', label: 'Points à placer' },
  { value: 'GENERATED', label: 'Généré' },
  { value: 'SUBMITTED', label: 'Déposé' },
  { value: 'APPROVED', label: 'Approuvé' },
  { value: 'REJECTED', label: 'Rejeté' },
] as const;

export const PROJECT_FILTER_VIEWS = [
  { value: 'active', label: 'En cours' },
  { value: 'archived', label: 'Archivés' },
  { value: 'all', label: 'Tous' },
] as const;

type FilterStatus = (typeof PROJECT_FILTER_STATUSES)[number]['value'];
type FilterView = (typeof PROJECT_FILTER_VIEWS)[number]['value'];

export interface ProjectListFilters {
  q: string;
  status: FilterStatus | null;
  view: FilterView;
}

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/** Reads the list's query string; an unknown value falls back to no filter. */
export function parseProjectFilters(query: Record<string, string | string[] | undefined>): ProjectListFilters {
  const status = first(query.status);
  const view = first(query.view);
  return {
    q: first(query.q).slice(0, 100),
    status: PROJECT_FILTER_STATUSES.find((s) => s.value === status)?.value ?? null,
    view: PROJECT_FILTER_VIEWS.find((v) => v.value === view)?.value ?? 'active',
  };
}

/** The list's `where`: always scoped to the caller's company. */
export function projectListWhere(companyId: string, filters: ProjectListFilters): Prisma.ProjectWhereInput {
  const and: Prisma.ProjectWhereInput[] = [{ companyId }];
  if (filters.view === 'active') and.push({ archivedAt: null });
  if (filters.view === 'archived') and.push({ archivedAt: { not: null } });
  if (filters.status === 'PROPOSALS' || filters.status === 'LOCATIONS') {
    and.push({ status: 'DRAFT', flowStep: filters.status });
  } else if (filters.status) {
    and.push({ status: filters.status });
  }
  if (filters.q) {
    const contains = { contains: filters.q, mode: 'insensitive' as const };
    and.push({
      OR: [
        { client: { fullName: contains } },
        { client: { stegReference: contains } },
        { client: { city: contains } },
        { dossierNumber: contains },
      ],
    });
  }
  return { AND: and };
}
