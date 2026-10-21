export interface ExistingItem {
  id: string;
  catalogStatus: 'DRAFT' | 'PUBLISHED';
  values: Record<string, unknown>;
}

export type ImportAction =
  | { kind: 'skip'; reason: string }
  | { kind: 'create' }
  | { kind: 'update-draft' }
  | { kind: 'refresh-published'; differences: string[] };

export function planImport(
  existing: ExistingItem | null,
  incoming: { errors: string[]; values: Record<string, unknown> },
  requiredKeys: readonly string[],
): ImportAction {
  const missing = requiredKeys.filter((key) => incoming.values[key] === null || incoming.values[key] === undefined);
  if (missing.length > 0) return { kind: 'skip', reason: `${missing.join(', ')} manquant` };
  if (!existing) return { kind: 'create' };
  if (existing.catalogStatus === 'DRAFT') return { kind: 'update-draft' };
  const differences = Object.entries(incoming.values)
    .filter(([key, value]) => key in existing.values && existing.values[key] !== value)
    .map(([key, value]) => `${key} : ${String(existing.values[key])} → ${String(value)}`);
  return { kind: 'refresh-published', differences };
}
