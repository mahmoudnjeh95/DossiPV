/** Claude models the admin can pick for the dossier text generation. */
export const CLAUDE_MODEL_OPTIONS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (par défaut)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (plus précis, plus cher)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (plus rapide, moins cher)' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (le plus capable)' },
] as const;

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

export function isClaudeModelId(value: unknown): value is (typeof CLAUDE_MODEL_OPTIONS)[number]['id'] {
  return CLAUDE_MODEL_OPTIONS.some((option) => option.id === value);
}

/** The stored choice if it is still a known model, else the default. */
export function resolveClaudeModel(stored: string | null | undefined): string {
  return isClaudeModelId(stored) ? stored : DEFAULT_CLAUDE_MODEL;
}
