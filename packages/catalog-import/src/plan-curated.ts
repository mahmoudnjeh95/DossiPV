export type CuratedPlan = 'create' | 'skip' | 'create-alongside';

/** A shared row only counts as already imported when it carries import provenance. */
export function planCuratedImport(existing: { datasheetSourceUrl: string | null }[]): CuratedPlan {
  if (existing.length === 0) return 'create';
  return existing.some((row) => row.datasheetSourceUrl !== null) ? 'skip' : 'create-alongside';
}
