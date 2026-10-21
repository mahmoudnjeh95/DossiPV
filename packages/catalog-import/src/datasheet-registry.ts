import { z } from 'zod';

const familySchema = z.object({
  kind: z.enum(['PV_MODULE', 'INVERTER']),
  brand: z.string().min(1),
  url: z.string().url().startsWith('https://'),
  models: z.array(z.string().min(1)).min(1),
});

export type DatasheetFamily = z.infer<typeof familySchema>;

export function parseRegistry(json: unknown): DatasheetFamily[] {
  return z.array(familySchema).parse(json);
}

export function checkRegistryAgainstListings(
  families: DatasheetFamily[],
  panelModels: Set<string>,
  inverterModels: Set<string>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const family of families) {
    const listed = family.kind === 'PV_MODULE' ? panelModels : inverterModels;
    for (const model of family.models) {
      if (seen.has(model)) problems.push(`${model} : présent dans plusieurs fiches.`);
      seen.add(model);
      if (!listed.has(model)) {
        problems.push(`${model} : absent de la liste officielle ${family.kind === 'PV_MODULE' ? 'ANME' : 'STEG'}.`);
      }
    }
  }
  return problems;
}
