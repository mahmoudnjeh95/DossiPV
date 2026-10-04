import { describe, it, expect, vi } from 'vitest';
import { generatePage37Layout, Page37LayoutParseError } from '../src/generate-page-37-layout';

function fakeClient(parsedOutput: unknown): { client: import('@anthropic-ai/sdk').default; parseMock: ReturnType<typeof vi.fn> } {
  const parseMock = vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
  const client = {
    messages: {
      parse: parseMock,
    },
  } as unknown as import('@anthropic-ai/sdk').default;
  return { client, parseMock };
}

const samplePoints = {
  technicalRoom: { lat: 36.801, lon: 10.201 },
  meter: { lat: 36.799, lon: 10.199 },
  earthPit: { lat: 36.8005, lon: 10.2005 },
};

describe('generatePage37Layout', () => {
  it('returns the parsed panel rectangle and wire route on a valid response', async () => {
    const { client } = fakeClient({
      panelRectangle: [{ lat: 36.8, lon: 10.2 }, { lat: 36.8001, lon: 10.2 }, { lat: 36.8001, lon: 10.2001 }, { lat: 36.8, lon: 10.2001 }],
      wireRoute: [{ lat: 36.8, lon: 10.2 }, { lat: 36.801, lon: 10.201 }],
    });

    const result = await generatePage37Layout({ satelliteImage: Buffer.from('fake-png'), points: samplePoints }, client);

    expect(result.panelRectangle).toHaveLength(4);
    expect(result.wireRoute).toHaveLength(2);
  });

  it('throws Page37LayoutParseError when Claude returns no parsed output', async () => {
    const { client } = fakeClient(null);

    await expect(
      generatePage37Layout({ satelliteImage: Buffer.from('fake-png'), points: samplePoints }, client),
    ).rejects.toThrow(Page37LayoutParseError);
  });

  it('throws Page37LayoutParseError when a coordinate is out of valid lat/lon range (malformed response)', async () => {
    const { client } = fakeClient({
      panelRectangle: [{ lat: 999, lon: 10.2 }],
      wireRoute: [],
    });

    await expect(
      generatePage37Layout({ satelliteImage: Buffer.from('fake-png'), points: samplePoints }, client),
    ).rejects.toThrow(Page37LayoutParseError);
  });

  it('calls Claude with model claude-sonnet-5-5', async () => {
    const { client, parseMock } = fakeClient({ panelRectangle: [], wireRoute: [] });

    await generatePage37Layout({ satelliteImage: Buffer.from('fake-png'), points: samplePoints }, client);

    expect(parseMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5-5' }),
    );
  });
});
