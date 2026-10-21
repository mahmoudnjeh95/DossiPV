import type Anthropic from '@anthropic-ai/sdk';
import type { DatasheetFamily } from './datasheet-registry';
import type { InverterRecord, PvModuleRecord } from './validate-records';

export class DatasheetRefusedError extends Error {
  constructor(url: string) {
    super(`Claude a refusé de lire la fiche ${url}.`);
    this.name = 'DatasheetRefusedError';
  }
}

const num = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const str = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const bool = { anyOf: [{ type: 'boolean' }, { type: 'null' }] };
const pages = { type: 'array', items: { type: 'integer' } };

interface RecordsFormat {
  type: 'json_schema';
  schema: Record<string, unknown>;
}

function recordsFormat(properties: Record<string, unknown>): RecordsFormat {
  return {
    type: 'json_schema' as const,
    schema: {
      type: 'object',
      properties: {
        records: {
          type: 'array',
          items: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
        },
      },
      required: ['records'],
      additionalProperties: false,
    },
  };
}

const MODULE_FORMAT = recordsFormat({
  model: { type: 'string' }, pmaxW: num, vmpV: num, impA: num, vocV: num, iscA: num,
  tempCoeffVocPct: num, tempCoeffIscPct: num, tempCoeffPmaxPct: num, tempCoeffVmpPct: num,
  irmA: num, maxSystemVoltageV: num, bifacial: { type: 'boolean' }, bifacialGainPct: num,
  lengthMm: num, widthMm: num, weightKg: num, noctC: num, sourcePages: pages,
});

const INVERTER_FORMAT = recordsFormat({
  model: { type: 'string' }, phases: num, pacW: num, sacVA: num, vdcMaxV: num, mpptMinV: num, mpptMaxV: num,
  startUpV: num, mpptCount: num, inputsPerMppt: num, idcMaxPerMpptA: num, iscMaxPerMpptA: num,
  vacNomV: num, vacRangeV: str, iacMaxA: num, integratedDcSwitch: bool, sourcePages: pages,
});

const MODULE_INSTRUCTIONS = [
  'Lis la fiche technique de modules photovoltaïques jointe.',
  'Pour chaque modèle demandé présent sur la fiche, donne les valeurs STC (1000 W/m², 25 °C) de la face avant.',
  'irmA = calibre maximal du fusible série (maximum series fuse rating), en A.',
  'Coefficients de température en %/°C, signe compris (par exemple -0.26).',
  'Dimensions en mm, poids en kg, noctC = température NOCT ou NMOT en °C.',
  "Si une valeur n'est pas sur la fiche, mets null : n'estime jamais une valeur.",
  'sourcePages = pages (à partir de 1) où se trouvent les valeurs.',
].join('\n');

const INVERTER_INSTRUCTIONS = [
  'Lis la fiche technique d’onduleurs photovoltaïques réseau jointe.',
  'pacW = puissance AC nominale (W), sacVA = puissance apparente max (VA), vdcMaxV = tension DC max.',
  'mpptMinV / mpptMaxV = plage de tension MPPT, startUpV = tension de démarrage.',
  'idcMaxPerMpptA = courant d’entrée max par MPPT, iscMaxPerMpptA = courant de court-circuit max par MPPT.',
  'vacNomV = tension AC nominale (230 en monophasé, 400 en triphasé), iacMaxA = courant AC max.',
  'integratedDcSwitch = true si un sectionneur DC est intégré.',
  "Si une valeur n'est pas sur la fiche, mets null : n'estime jamais une valeur.",
  'sourcePages = pages (à partir de 1) où se trouvent les valeurs.',
].join('\n');

export async function extractDatasheet(
  family: DatasheetFamily,
  pdf: Buffer,
  client: Anthropic,
): Promise<{ records: (PvModuleRecord | InverterRecord)[]; missingModels: string[] }> {
  const isModule = family.kind === 'PV_MODULE';
  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'high', format: isModule ? MODULE_FORMAT : INVERTER_FORMAT },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          {
            type: 'text',
            text: `${isModule ? MODULE_INSTRUCTIONS : INVERTER_INSTRUCTIONS}\n\nModèles demandés (${family.brand}) :\n${family.models.join('\n')}`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') throw new DatasheetRefusedError(family.url);
  const output = response.parsed_output as { records: (PvModuleRecord | InverterRecord)[] } | null;
  if (!output) throw new Error(`Réponse illisible pour ${family.url}.`);

  const wanted = new Set(family.models);
  const records = output.records.filter((record) => wanted.has(record.model));
  const found = new Set(records.map((record) => record.model));
  return { records, missingModels: family.models.filter((model) => !found.has(model)) };
}
