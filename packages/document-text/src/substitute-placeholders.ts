import { DOSSIER_TEXT_SECTION_KEYS, type DossierTextSections } from './types';

/**
 * Thrown when a {PLACEHOLDER} appears in Claude's generated text but no
 * matching value was supplied to fill it in. This should never happen in
 * practice if the caller's value map always contains the full set of
 * engine-derived values — treat it as a bug, not an expected runtime case.
 */
export class MissingPlaceholderValueError extends Error {
  constructor(placeholder: string, section: string) {
    super(
      `Section "${section}" has placeholder {${placeholder}} with no matching value supplied.`,
    );
    this.name = 'MissingPlaceholderValueError';
  }
}

const PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_]+)\}/g;

/**
 * Replaces every {PLACEHOLDER} token in every section of generated dossier
 * text with its real value from `values`. This is the second half of the
 * spec §3/§5 guarantee: generateDossierText() ensures Claude never writes
 * a raw number, and this function is what actually supplies the real,
 * engine-computed numbers afterward — the two run as separate steps so a
 * bug in one can never silently mask a bug in the other.
 *
 * Throws MissingPlaceholderValueError (rather than leaving a literal
 * "{FOO}" in the final dossier) if a placeholder has no matching value.
 */
export function substitutePlaceholders(
  sections: DossierTextSections,
  values: Record<string, string | number>,
): DossierTextSections {
  const result = {} as DossierTextSections;

  for (const key of DOSSIER_TEXT_SECTION_KEYS) {
    result[key] = sections[key].replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
      if (!(name in values)) {
        throw new MissingPlaceholderValueError(name, key);
      }
      return String(values[name]);
    });
  }

  return result;
}
