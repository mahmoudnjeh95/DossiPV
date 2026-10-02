import type { RunEngineInput, MpptConfig } from '@dossipv/engine';

export interface ProjectMeta {
  moduleBrandModel: string;
  inverterBrandModel: string;
  gridType: string;
  mountingType: string;
  structureMaterial: string;
  earthRodCount: number;
}

export interface PlaceholderSourceContext {
  derived: Record<string, number>;
  engineInput: RunEngineInput;
  representativeMppt: MpptConfig;
  projectMeta: ProjectMeta;
}

interface PlaceholderDefinition {
  source: (ctx: PlaceholderSourceContext) => number | string;
  decimals?: number;
  unit?: string;
}

/**
 * The full set of placeholder names dossier text is allowed to use. This table is the single
 * source of truth consumed both by buildPlaceholderValues (fills real values) and by the
 * prompt builder (lists allowed names to Claude) — see dossier-worker's index.ts.
 */
export const PLACEHOLDER_DEFINITIONS: Record<string, PlaceholderDefinition> = {
  P_DC_W: { source: (c) => c.derived.P_DC_W!, decimals: 0, unit: 'W' },
  MODULE_COUNT: { source: (c) => c.derived.MODULE_COUNT! },
  NS: { source: (c) => c.representativeMppt.modulesPerString },
  NP: { source: (c) => c.representativeMppt.stringsInParallel },
  STRING_VOC_TMIN: { source: (c) => c.derived.STRING_VOC_TMIN!, decimals: 1, unit: 'V' },
  STRING_VMP_STC: { source: (c) => c.derived.STRING_VMP_STC!, decimals: 1, unit: 'V' },
  DU_DC_PCT: { source: (c) => c.derived.DU_DC_PCT!, decimals: 2, unit: '%' },
  DU_AC_PCT: { source: (c) => c.derived.DU_AC_PCT!, decimals: 2, unit: '%' },
  INVERTER_COUNT: { source: (c) => c.engineInput.array.length },
  EARTH_ROD_COUNT: { source: (c) => c.projectMeta.earthRodCount },
  NORME_CABLAGE: { source: () => 'NF C 15-100' },
};

function formatValue(value: number | string, decimals: number | undefined, unit: string | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  const formatted =
    decimals === undefined
      ? new Intl.NumberFormat('fr-FR').format(value)
      : new Intl.NumberFormat('fr-FR', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Computes every placeholder's real, formatted value from PLACEHOLDER_DEFINITIONS.
 * Numbers are formatted French-locale (comma decimal separator, space thousands separator,
 * non-breaking space before a unit suffix); strings pass through unchanged.
 */
export function buildPlaceholderValues(ctx: PlaceholderSourceContext): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, definition] of Object.entries(PLACEHOLDER_DEFINITIONS)) {
    const rawValue = definition.source(ctx);
    result[name] = formatValue(rawValue, definition.decimals, definition.unit);
  }
  return result;
}
