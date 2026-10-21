import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { extractDatasheet, DatasheetRefusedError } from '../src/extract-datasheet';

function fakeClient(response: unknown): { client: Anthropic; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

const family = { kind: 'PV_MODULE' as const, brand: 'LONGi', url: 'https://example.com/lr5.pdf', models: ['LR5-72HTH-575M', 'LR5-72HTH-585M'] };
const record = (model: string): Record<string, unknown> => ({
  model, pmaxW: 585, vmpV: 44.4, impA: 13.18, vocV: 53.2, iscA: 13.98, tempCoeffVocPct: -0.23, tempCoeffIscPct: 0.05,
  tempCoeffPmaxPct: -0.28, tempCoeffVmpPct: null, irmA: 30, maxSystemVoltageV: 1500, bifacial: false, bifacialGainPct: null,
  lengthMm: 2278, widthMm: 1134, weightKg: 27.2, noctC: 45, sourcePages: [1],
});

describe('extractDatasheet', () => {
  it('sends the PDF and the exact model list to claude-opus-5-5 and keeps only requested models', async () => {
    const { client, parse } = fakeClient({
      stop_reason: 'end_turn',
      parsed_output: { records: [record('LR5-72HTH-585M'), record('LR5-72HTH-595M')] },
    });

    const result = await extractDatasheet(family, Buffer.from('%PDF'), client);

    const request = parse.mock.calls[0]![0] as {
      model: string;
      output_config: { effort: string };
      messages: { content: { text?: string }[] }[];
    };
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.output_config.effort).toBe('high');
    expect(request.messages[0]!.content[0]).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } });
    expect(request.messages[0]!.content[1]!.text).toContain('LR5-72HTH-575M');
    expect(result.records.map((r) => r.model)).toEqual(['LR5-72HTH-585M']);
    expect(result.missingModels).toEqual(['LR5-72HTH-575M']);
  });

  it('turns a refusal into DatasheetRefusedError', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal', parsed_output: null });
    await expect(extractDatasheet(family, Buffer.from('%PDF'), client)).rejects.toBeInstanceOf(DatasheetRefusedError);
  });
});
