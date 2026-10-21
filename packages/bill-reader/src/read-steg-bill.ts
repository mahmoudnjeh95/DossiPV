import type Anthropic from '@anthropic-ai/sdk';
import type { StegBillReading } from './types';

export const BILL_READER_MODEL = 'claude-opus-5-5';

export type BillMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export interface BillInput {
  bytes: Buffer;
  mediaType: BillMediaType;
}

export class BillReadingError extends Error {
  constructor() {
    super("La facture n'a pas pu être lue. Reprenez une photo nette de la facture entière.");
    this.name = 'BillReadingError';
  }
}

const nullable = (type: string): { type: string[] } => ({ type: [type, 'null'] });

const lineJsonSchema = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    oldIndex: nullable('number'),
    newIndex: nullable('number'),
    quantityKWh: nullable('number'),
    unitPrice: nullable('number'),
    amountHT: nullable('number'),
    vatPct: nullable('number'),
  },
  required: ['label', 'oldIndex', 'newIndex', 'quantityKWh', 'unitPrice', 'amountHT', 'vatPct'],
  additionalProperties: false,
};

const readingProperties = {
  clientName: nullable('string'),
  civility: { enum: ['M', 'Mme', 'Mlle', 'societe', null] },
  address: nullable('string'),
  postalCode: nullable('string'),
  city: nullable('string'),
  stegDistrict: nullable('string'),
  governorate: nullable('string'),
  governorateInferred: { type: 'boolean' },
  stegReference: nullable('string'),
  meterNumber: nullable('string'),
  periodStart: nullable('string'),
  periodEnd: nullable('string'),
  monthsBilled: nullable('number'),
  subscribedPowerKVA: nullable('number'),
  tariffLabel: nullable('string'),
  lines: { type: 'array', items: lineJsonSchema },
  totalElectricityKWh: nullable('number'),
  electricityAmountTND: nullable('number'),
  amountDueTND: nullable('number'),
  readingNotes: { type: 'array', items: { type: 'string' } },
};

const billOutputFormat = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: readingProperties,
    required: Object.keys(readingProperties),
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = [
  "Tu lis une facture STEG tunisienne (Société Tunisienne de l'Electricité et du Gaz), rédigée en français et en arabe, fournie en photo ou en PDF.",
  "Recopie chaque valeur exactement comme elle est imprimée. Si une valeur est illisible, absente ou incertaine, renvoie null : ne l'estime jamais et ne la calcule jamais.",
  "Le gouvernorat peut être déduit de la ville ou du district STEG ; dans ce cas seulement, mets governorateInferred à true (false s'il est imprimé sur la facture).",
  'Les quantités sont en kWh. Les dates sont au format ISO (AAAA-MM-JJ).',
  "Signale dans readingNotes toute difficulté de lecture ou toute incohérence que tu remarques.",
].join(' ');

const USER_INSTRUCTIONS = 'Lis cette facture STEG et renvoie les champs demandés.';

function sourceBlock(input: BillInput): Anthropic.Messages.ContentBlockParam {
  const data = input.bytes.toString('base64');
  if (input.mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  }
  return { type: 'image', source: { type: 'base64', media_type: input.mediaType, data } };
}

/**
 * Sends a STEG bill (photo or PDF) to claude-opus-5-5 and returns the structured reading.
 * Values the model cannot read come back null; arithmetic checks live in checkBillReading.
 */
export async function readStegBill(input: BillInput, client: Anthropic): Promise<StegBillReading> {
  let response;
  try {
    response = await client.messages.parse({
      model: BILL_READER_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [sourceBlock(input), { type: 'text', text: USER_INSTRUCTIONS }] }],
      output_config: { format: billOutputFormat },
    });
  } catch (error) {
    // The SDK JSON-parses the text block before stop_reason can be checked, so a plain-text
    // refusal surfaces as this error. Other failures (network, auth) propagate unchanged.
    if (error instanceof Error && error.message.startsWith('Failed to parse structured output')) {
      throw new BillReadingError();
    }
    throw error;
  }

  if (response.stop_reason === 'refusal' || response.parsed_output == null) {
    throw new BillReadingError();
  }
  return response.parsed_output;
}
