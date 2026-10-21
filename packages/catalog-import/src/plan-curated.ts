export type CuratedPlan = 'create' | 'skip' | 'create-alongside';

/** A shared row only counts as already imported when it carries import provenance. */
export function planCuratedImport(existing: { datasheetSourceUrl: string | null }[]): CuratedPlan {
  if (existing.length === 0) return 'create';
  return existing.some((row) => row.datasheetSourceUrl !== null) ? 'skip' : 'create-alongside';
}

/**
 * Picks the shared row that import planning compares against: the one with import provenance.
 * Provenance-less same-name rows (seed data) are ignored and reported as a conflict.
 */
export function pickPlanningRow<T extends { datasheetSourceUrl: string | null }>(rows: T[]): { row: T | null; conflict: boolean } {
  const row = rows.find((r) => r.datasheetSourceUrl !== null) ?? null;
  return { row, conflict: row === null && rows.length > 0 };
}
