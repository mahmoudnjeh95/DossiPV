import { DOSSIER_TEXT_SECTION_KEYS, type DossierTextSections } from './types';

/**
 * Thrown when a generated dossier section contains a literal digit outside
 * a {PLACEHOLDER} token. This is the second, code-enforced layer of the
 * "Claude never emits a raw number" guarantee (the first layer is the
 * prompt instruction in prompt.ts) — spec §3/§5 requires every number in
 * the dossier to come from @dossipv/engine, never from the model.
 */
export class RawNumberLeakError extends Error {
  constructor(section: string, excerpt: string) {
    super(
      `Section "${section}" contains a raw digit outside a {PLACEHOLDER} — excerpt: "${excerpt}"`,
    );
    this.name = 'RawNumberLeakError';
  }
}

/**
 * Strips every {PLACEHOLDER} token, then checks what remains for a digit.
 * A digit inside {...} is allowed (placeholder names may contain digits,
 * e.g. {P_DC_W}); a digit anywhere else is a leak.
 */
function containsRawDigit(text: string): { found: boolean; excerpt: string } {
  const withoutPlaceholders = text.replace(/\{[^}]*\}/g, '');
  const match = withoutPlaceholders.match(/.{0,20}\d.{0,20}/);
  if (match) {
    return { found: true, excerpt: match[0] };
  }
  return { found: false, excerpt: '' };
}

/**
 * Validates every section of a generated dossier text for raw digits.
 * Throws RawNumberLeakError on the first section where one is found.
 * Returns void (no return value needed — a throw is the only outcome
 * the caller needs to handle) when every section is clean.
 */
export function assertNoRawNumbers(sections: DossierTextSections): void {
  for (const key of DOSSIER_TEXT_SECTION_KEYS) {
    const { found, excerpt } = containsRawDigit(sections[key]);
    if (found) {
      throw new RawNumberLeakError(key, excerpt);
    }
  }
}
