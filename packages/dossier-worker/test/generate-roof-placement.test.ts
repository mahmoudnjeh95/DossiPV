import { describe, it, expect, vi } from 'vitest';
import {
  generateRoofPlacement,
  isRetryableRoofPlacementError,
  RoofPlacementParseError,
  validateRoofPlacement,
  type RoofPlacementInput,
} from '../src/generate-roof-placement';

function fakeClient(response: { parsed_output: unknown; stop_reason?: string }): { client: import('@anthropic-ai/sdk').default; parseMock: ReturnType<typeof vi.fn> } {
  const parseMock = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', ...response });
  const client = { messages: { parse: parseMock } } as unknown as import('@anthropic-ai/sdk').default;
  return { client, parseMock };
}

const input: RoofPlacementInput = {
  satelliteImage: Buffer.from('fake-jpeg'),
  imageWidthPx: 640,
  imageHeightPx: 480,
  metersPerPixel: 0.2,
  roofOutline: [{ x: 200, y: 150 }, { x: 440, y: 150 }, { x: 440, y: 330 }, { x: 200, y: 330 }],
  field: { x: 300, y: 240 },
  array: { moduleCount: 12, perRow: 7, rows: 2, widthM: 7.4, depthM: 5.4 },
  azimuthDeg: 0,
  tiltDeg: 30,
};

function promptText(parseMock: ReturnType<typeof vi.fn>): string {
  const call = parseMock.mock.calls[0]![0] as { messages: { content: { type: string; text?: string }[] }[] };
  return call.messages[0]!.content.find((block) => block.type === 'text')!.text!;
}

describe('generateRoofPlacement', () => {
  it('returns the centre Claude chose on the roof', async () => {
    const { client } = fakeClient({ parsed_output: { centre: { x: 380, y: 200 }, freeRowLengthPx: 45 } });

    expect(await generateRoofPlacement(input, client)).toEqual({ centre: { x: 380, y: 200 }, freeRowLengthPx: 45 });
  });

  it('describes the photo, the roof, the field point and the array in PIXELS and metres', async () => {
    const { client, parseMock } = fakeClient({ parsed_output: { centre: { x: 380, y: 200 }, freeRowLengthPx: 45 } });

    await generateRoofPlacement(input, client);

    const text = promptText(parseMock);
    expect(text).toContain('640 x 480 pixels, environ 0.20 m par pixel');
    expect(text).toContain("Contour du toit (sommets dans l'ordre) : (x=200, y=150) ; (x=440, y=150) ; (x=440, y=330) ; (x=200, y=330).");
    expect(text).toContain("Point « Champ PV » placé par l'installateur (indicatif) : x=300, y=240.");
    expect(text).toContain('12 modules en 2 rangée(s) de 7 au plus, inclinés à 30°');
    expect(text).toContain('alignées est-ouest');
    expect(text).toContain('environ 7,4 m le long des rangées sur 5,4 m, soit environ 37 x 27 pixels');
    const call = parseMock.mock.calls[0]![0] as { model: string; system: string; messages: { content: { type: string; source?: { media_type?: string } }[] }[] };
    expect(call.model).toBe('claude-opus-5-5');
    expect(call.system).toContain('obstacles');
    expect(call.system).toContain('repère sur la photo chaque obstacle du toit');
    expect(call.system).toContain('UNE seule partie plane et dégagée du toit : il ne recouvre ni ne chevauche aucun obstacle, aucune bordure');
    expect(call.system).toContain("hors de l'ombre portée en hiver");
    expect(call.system).toContain('longueur libre le long des rangées');
    expect(call.messages[0]!.content.find((block) => block.type === 'image')!.source!.media_type).toBe('image/jpeg');
  });

  it('drops a free row length that is not a length', async () => {
    const { client } = fakeClient({ parsed_output: { centre: { x: 380, y: 200 }, freeRowLengthPx: 0 } });

    expect(await generateRoofPlacement(input, client)).toEqual({ centre: { x: 380, y: 200 }, freeRowLengthPx: null });
  });

  it('names a turned orientation', async () => {
    const { client, parseMock } = fakeClient({ parsed_output: { centre: { x: 380, y: 200 }, freeRowLengthPx: 45 } });

    await generateRoofPlacement({ ...input, azimuthDeg: -20 }, client);

    expect(promptText(parseMock)).toContain("sud tourné de 20° vers l'est");
  });

  it('throws a retryable error for no answer or a centre off the roof', async () => {
    await expect(generateRoofPlacement(input, fakeClient({ parsed_output: null }).client)).rejects.toBeInstanceOf(RoofPlacementParseError);
    const offRoof = generateRoofPlacement(input, fakeClient({ parsed_output: { centre: { x: 100, y: 100 }, freeRowLengthPx: 45 } }).client);
    await expect(offRoof).rejects.toThrow('outside the roof contour');
    expect(isRetryableRoofPlacementError(new RoofPlacementParseError('x'))).toBe(true);
  });

  it('does not retry a refusal', async () => {
    const refused = generateRoofPlacement(input, fakeClient({ parsed_output: null, stop_reason: 'refusal' }).client);

    await expect(refused).rejects.toThrow('declined');
    await refused.catch((error: unknown) => expect(isRetryableRoofPlacementError(error)).toBe(false));
  });
});

describe('validateRoofPlacement', () => {
  it('refuses a centre outside the photo', () => {
    expect(() => validateRoofPlacement({ centre: { x: 700, y: 200 }, freeRowLengthPx: null }, input)).toThrow('outside the 640x480 image');
  });

  it('accepts a centre inside an L-shaped roof but not in its notch', () => {
    const lShape = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 100 }, { x: 0, y: 100 }];
    const roof = { ...input, roofOutline: lShape };
    expect(validateRoofPlacement({ centre: { x: 50, y: 10 }, freeRowLengthPx: null }, roof)).toEqual({ centre: { x: 50, y: 10 }, freeRowLengthPx: null });
    expect(() => validateRoofPlacement({ centre: { x: 60, y: 60 }, freeRowLengthPx: null }, roof)).toThrow('outside the roof contour');
  });
});
