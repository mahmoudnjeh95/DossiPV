/**
 * Input/output types for dossier text generation.
 *
 * Design rule (spec §3/§5): Claude never receives client personal data
 * (name, CIN, address, STEG reference) and never emits a raw number in its
 * response — every figure the dossier needs is already computed by
 * @dossipv/engine and gets substituted into the text afterward via named
 * placeholders. This file's shape enforces the "no PII in" half of that
 * rule; prompt.ts and generate-dossier-text.ts enforce the "no numbers out"
 * half.
 */

/**
 * Technical facts Claude is allowed to see, to write the dossier's prose
 * from. Every field here is non-personal: equipment brand/model names,
 * site conditions, and project classification — no client identity, no
 * address, no GPS coordinates, no STEG reference.
 */
export interface DossierTextInput {
  /** e.g. "LONGi LR7-72HGD-620M" */
  moduleBrandModel: string;
  /** e.g. "Sofar 1-4KTL2-G3" */
  inverterBrandModel: string;
  inverterCount: number;
  /** "BT" | "MT" | "ISOLATED" — matches site.gridType in the schema */
  gridType: string;
  /** 1 | 3 */
  phases: 1 | 3;
  /** "FLAT_ROOF_BALLAST" | "FLAT_ROOF_ANCHORED" | "SLOPED_ROOF" | "GROUND" | "CARPORT" */
  mountingType: string;
  structureMaterial: string;
  earthRodCount: number;
  /** true when the DC fuse section applies (x-rules DC_FUSE_REQUIRED) */
  dcFuseRequired: boolean;
  /** true when the AC isolator section applies (more than one inverter) */
  acIsolatorRequired: boolean;
  /**
   * The exhaustive list of installed protection devices, one line each, written with
   * `{..._REF}` / `{AC_BREAKER_FUNCTION}` placeholders (never literal model names or digits).
   */
  protectionLines: string[];
}

/**
 * The 6 prose sections the dossier template needs, in French. Every field
 * may contain `{PLACEHOLDER}` tokens (e.g. "{P_DC_W}") in place of any
 * number — never a literal digit. generate-dossier-text.ts validates this
 * before returning.
 */
export interface DossierTextSections {
  introduction: string;
  solution: string;
  cabling: string;
  earthing: string;
  structure: string;
  conclusion: string;
}

/** The names of DossierTextSections' fields, used to build/validate the schema. */
export const DOSSIER_TEXT_SECTION_KEYS = [
  'introduction',
  'solution',
  'cabling',
  'earthing',
  'structure',
  'conclusion',
] as const;
