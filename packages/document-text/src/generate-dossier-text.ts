import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { DOSSIER_TEXT_SYSTEM_PROMPT, buildDossierTextUserPrompt } from './prompt';
import { assertNoRawNumbers } from './validate-no-raw-numbers';
import { DOSSIER_TEXT_SECTION_KEYS, type DossierTextInput, type DossierTextSections } from './types';

/**
 * Zod schema mirroring DossierTextSections — used to runtime-validate the
 * parsed response shape (client.messages.parse's `parsed_output` is typed
 * `unknown` until checked).
 */
const dossierTextSectionsSchema = z.object({
  introduction: z.string(),
  solution: z.string(),
  cabling: z.string(),
  earthing: z.string(),
  structure: z.string(),
  conclusion: z.string(),
});

/**
 * Hand-built JSON Schema for output_config.format, equivalent to what
 * zodOutputFormat(dossierTextSectionsSchema) would produce. Built by hand
 * rather than via the SDK's zodOutputFormat helper because that helper
 * requires Zod v4's z.toJSONSchema, while this monorepo pins Zod v3
 * (matching @dossipv/engine's existing dependency) — the Zod schema above
 * still does the real runtime validation of the parsed response; this
 * object only tells the API what shape to produce.
 */
const dossierTextOutputFormat = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: Object.fromEntries(
      DOSSIER_TEXT_SECTION_KEYS.map((key) => [key, { type: 'string' }]),
    ),
    required: [...DOSSIER_TEXT_SECTION_KEYS],
    additionalProperties: false,
  },
};

/** Thrown when Claude's response could not be parsed into the expected 6-section shape. */
export class DossierTextParseError extends Error {
  constructor() {
    super('Claude did not return a response matching the expected dossier text sections.');
    this.name = 'DossierTextParseError';
  }
}

/**
 * Generates the French prose sections for a PV dossier from already-validated
 * technical data (spec §3/§5). The `client` parameter is injected so callers
 * (and tests) can supply a fake — this function never constructs its own
 * Anthropic client, keeping it free of any API-key/environment assumption.
 *
 * Guarantees enforced here (not just by the prompt):
 * - Input is DossierTextInput, which structurally contains no client PII.
 * - Output is validated against assertNoRawNumbers before being returned —
 *   a response containing a literal digit outside a {PLACEHOLDER} throws
 *   RawNumberLeakError rather than being silently passed through.
 */
export async function generateDossierText(
  input: DossierTextInput,
  client: Anthropic,
  allowedPlaceholderNames: string[],
): Promise<DossierTextSections> {
  const response = await client.messages.parse({
    model: 'claude-sonnet-5-5',
    max_tokens: 4096,
    system: DOSSIER_TEXT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildDossierTextUserPrompt(input, allowedPlaceholderNames) }],
    output_config: {
      format: dossierTextOutputFormat,
    },
  });

  if (response.parsed_output === null) {
    throw new DossierTextParseError();
  }

  const sections = dossierTextSectionsSchema.parse(response.parsed_output);
  assertNoRawNumbers(sections);

  return sections;
}
