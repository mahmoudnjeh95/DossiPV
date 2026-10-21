import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { readStegBill, BillReadingError, BILL_READER_MODEL } from '../src/read-steg-bill';
import { testBill } from './fixtures/test-bill';

const RETAKE_MESSAGE = "La facture n'a pas pu être lue. Reprenez une photo nette de la facture entière.";

function clientReturning(result: unknown): { client: Anthropic; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn().mockResolvedValue(result);
  return { client: { messages: { parse } } as unknown as Anthropic, parse };
}

interface ParseArgs {
  model: string;
  messages: Array<{ content: Array<{ type: string; source?: unknown }> }>;
  output_config: { format: { type: string; schema: { additionalProperties: boolean } } };
}
const firstCall = (parse: ReturnType<typeof vi.fn>): ParseArgs => parse.mock.calls[0]![0] as ParseArgs;

const bytes = Buffer.from([1, 2, 3, 4, 5]);

describe('readStegBill', () => {
  it('sends a webp image as a base64 image block', async () => {
    const { client, parse } = clientReturning({ parsed_output: testBill, stop_reason: 'end_turn' });
    await readStegBill({ bytes, mediaType: 'image/webp' }, client);
    const args = firstCall(parse);
    expect(args.model).toBe('claude-opus-5-5');
    expect(BILL_READER_MODEL).toBe('claude-opus-5-5');
    expect(args.messages[0]!.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/webp', data: bytes.toString('base64') },
    });
    expect(args.output_config.format.type).toBe('json_schema');
    expect(args.output_config.format.schema.additionalProperties).toBe(false);
  });

  it('sends a PDF as a document block', async () => {
    const { client, parse } = clientReturning({ parsed_output: testBill, stop_reason: 'end_turn' });
    await readStegBill({ bytes, mediaType: 'application/pdf' }, client);
    const block = firstCall(parse).messages[0]!.content[0]!;
    expect(block.type).toBe('document');
    expect(block.source).toEqual({ type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') });
  });

  it('returns the parsed reading', async () => {
    const { client } = clientReturning({ parsed_output: testBill, stop_reason: 'end_turn' });
    await expect(readStegBill({ bytes, mediaType: 'image/jpeg' }, client)).resolves.toEqual(testBill);
  });

  it('throws BillReadingError on refusal', async () => {
    const { client } = clientReturning({ parsed_output: null, stop_reason: 'refusal' });
    const promise = readStegBill({ bytes, mediaType: 'image/png' }, client);
    await expect(promise).rejects.toBeInstanceOf(BillReadingError);
    await expect(promise).rejects.toThrow(RETAKE_MESSAGE);
  });

  it('throws BillReadingError when parsed_output is null', async () => {
    const { client } = clientReturning({ parsed_output: null, stop_reason: 'end_turn' });
    await expect(readStegBill({ bytes, mediaType: 'image/png' }, client)).rejects.toThrow(RETAKE_MESSAGE);
  });

  it('throws BillReadingError when the SDK fails to parse a non-JSON reply', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('Failed to parse structured output: Unexpected token'));
    const client = { messages: { parse } } as unknown as Anthropic;
    const promise = readStegBill({ bytes, mediaType: 'image/png' }, client);
    await expect(promise).rejects.toBeInstanceOf(BillReadingError);
    await expect(promise).rejects.toThrow(RETAKE_MESSAGE);
  });

  it('lets other API errors (network, auth) propagate unchanged', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('connection reset'));
    const client = { messages: { parse } } as unknown as Anthropic;
    await expect(readStegBill({ bytes, mediaType: 'image/png' }, client)).rejects.toThrow('connection reset');
  });
});
