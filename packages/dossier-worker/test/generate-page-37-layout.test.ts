import { describe, it, expect, vi } from 'vitest';
import {
  generatePage37Layout,
  validatePage37Layout,
  isRetryablePage37LayoutError,
  Page37LayoutParseError,
  Page37LayoutOutOfBoundsError,
  type Page37LayoutInput,
} from '../src/generate-page-37-layout';
import { ROOF_PART_RULE } from '../src/generate-roof-placement';

function fakeClient(parsedOutput: unknown): { client: import('@anthropic-ai/sdk').default; parseMock: ReturnType<typeof vi.fn> } {
  const parseMock = vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
  const client = {
    messages: {
      parse: parseMock,
    },
  } as unknown as import('@anthropic-ai/sdk').default;
  return { client, parseMock };
}

const baseInput: Page37LayoutInput = {
  satelliteImage: Buffer.from('fake-jpeg'),
  imageWidthPx: 640,
  imageHeightPx: 640,
  metersPerPixel: 0.24,
  sitePoint: { x: 320, y: 320 },
  points: { technicalRoom: { x: 400, y: 300 }, meter: { x: 250, y: 420 }, earthPit: { x: 380, y: 360 } },
  array: { moduleCount: 5, perRow: 5, rows: 1, widthM: 5.77, depthM: 2.06 },
  azimuthDeg: 0,
  tiltDeg: 30,
};

const validLayout = {
  panelRectangle: [{ x: 290, y: 290 }, { x: 350, y: 290 }, { x: 350, y: 330 }, { x: 290, y: 330 }],
  wireRoute: [{ x: 350, y: 310 }, { x: 400, y: 300 }, { x: 250, y: 420 }],
};

function promptText(parseMock: ReturnType<typeof vi.fn>): string {
  const call = parseMock.mock.calls[0]![0] as { system: string; messages: { content: { type: string; text?: string }[] }[] };
  return call.messages[0]!.content.find((block) => block.type === 'text')!.text!;
}

describe('generatePage37Layout', () => {
  it('returns the panel quad and wire route in image pixels on a valid response', async () => {
    const { client } = fakeClient(validLayout);

    const result = await generatePage37Layout(baseInput, client);

    expect(result).toEqual(validLayout);
  });

  it('tells the model the image size, the scale, and every point in PIXEL coordinates (not lat/lon)', async () => {
    const { client, parseMock } = fakeClient(validLayout);

    await generatePage37Layout(baseInput, client);

    const text = promptText(parseMock);
    expect(text).toContain('640 x 640 pixels');
    expect(text).toContain('0.24 m par pixel');
    expect(text).toContain('Point du site (bâtiment à équiper) : x=320, y=320');
    expect(text).toContain('Local technique : x=400, y=300');
    expect(text).toContain('Compteur STEG : x=250, y=420');
    expect(text).toContain('Prise de terre : x=380, y=360');
    expect(text).toContain('0 <= x <= 640');
    expect(text).not.toMatch(/lat=|lon=/);
    const system = (parseMock.mock.calls[0]![0] as { system: string }).system;
    expect(system).toContain('PIXELS');
    // The panels stay clear of the obstacles and of the borders between roof parts, like the 3D view's placement.
    expect(system).toContain(ROOF_PART_RULE);
  });

  it('asks for a quadrilateral the size of the array, along its rows', async () => {
    const { client, parseMock } = fakeClient(validLayout);

    await generatePage37Layout(baseInput, client);

    const text = promptText(parseMock);
    expect(text).toContain('5 modules en 1 rangée(s) de 5 au plus, inclinés à 30°');
    expect(text).toContain('alignées est-ouest');
    expect(text).toContain('environ 5,8 m le long des rangées sur 2,1 m');
    expect(text).toContain('Le quadrilatère du champ est cette emprise : environ 24 pixels le long des rangées sur 9 pixels.');
    expect(text).not.toContain('Surface du champ');
  });

  it('still sends a non-empty description (the site point) when only some points are placed', async () => {
    const { client, parseMock } = fakeClient(validLayout);

    await generatePage37Layout({ ...baseInput, points: { technicalRoom: null, meter: { x: 250, y: 420 }, earthPit: null } }, client);

    const text = promptText(parseMock);
    expect(text).toContain('Compteur STEG');
    expect(text).not.toContain('Local technique');
    expect(text).not.toContain('Prise de terre');
  });

  it('gives the drawn roof contour in pixels and asks to keep the panels inside it', async () => {
    const { client, parseMock } = fakeClient(validLayout);

    await generatePage37Layout({ ...baseInput, roofOutline: [{ x: 280, y: 280 }, { x: 360, y: 280.4 }, { x: 360, y: 340 }, { x: 280, y: 340 }] }, client);

    const text = promptText(parseMock);
    expect(text).toContain("Contour du toit tracé par l'installateur (sommets dans l'ordre) : (x=280, y=280) ; (x=360, y=280) ; (x=360, y=340) ; (x=280, y=340).");
    expect(text).toContain("doit rester entièrement à l'intérieur de ce contour");
  });

  it('says nothing of a roof contour when none was drawn', async () => {
    const { client, parseMock } = fakeClient(validLayout);

    await generatePage37Layout(baseInput, client);

    expect(promptText(parseMock)).not.toContain('Contour du toit');
  });

  it('throws Page37LayoutParseError when Claude returns no parsed output', async () => {
    const { client } = fakeClient(null);

    await expect(generatePage37Layout(baseInput, client)).rejects.toThrow(Page37LayoutParseError);
  });

  it.each([
    ['x beyond the image width', { ...validLayout, wireRoute: [{ x: 350, y: 310 }, { x: 641, y: 300 }] }],
    ['negative y', { ...validLayout, panelRectangle: [{ x: 290, y: -1 }, ...validLayout.panelRectangle.slice(1)] }],
    ['y beyond the image height', { ...validLayout, wireRoute: [{ x: 350, y: 310 }, { x: 300, y: 9999 }] }],
  ])('rejects a coordinate outside the image (%s) as an out-of-bounds layout error, never returning it', async (_label, layout) => {
    const { client } = fakeClient(layout);

    const error = await generatePage37Layout(baseInput, client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Page37LayoutOutOfBoundsError);
    expect(error).toBeInstanceOf(Page37LayoutParseError);
  });

  it('calls Claude with model claude-opus-5-5', async () => {
    const { client, parseMock } = fakeClient(validLayout);

    await generatePage37Layout(baseInput, client);

    expect(parseMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-5-5' }));
  });

  it('declares the image media_type as image/jpeg — the stitched Esri image is JPEG', async () => {
    const { client, parseMock } = fakeClient(validLayout);

    await generatePage37Layout(baseInput, client);

    const call = parseMock.mock.calls[0]![0] as { messages: { content: { type: string; source?: { media_type?: string } }[] }[] };
    const imageBlock = call.messages[0]!.content.find((block) => block.type === 'image');
    expect(imageBlock?.source?.media_type).toBe('image/jpeg');
  });

  it('keeps additionalProperties:false on the nested array-item schemas (the structured-output API rejects them otherwise)', async () => {
    const { client, parseMock } = fakeClient(validLayout);

    await generatePage37Layout(baseInput, client);

    const schema = (parseMock.mock.calls[0]![0] as { output_config: { format: { schema: { additionalProperties: boolean; properties: Record<string, { items: { additionalProperties: boolean; required: string[] } }> } } } }).output_config.format.schema;
    expect(schema.additionalProperties).toBe(false);
    for (const key of ['panelRectangle', 'wireRoute']) {
      expect(schema.properties[key]!.items.additionalProperties).toBe(false);
      expect(schema.properties[key]!.items.required).toEqual(['x', 'y']);
    }
  });
});

describe('validatePage37Layout', () => {
  it('accepts a layout touching the image edges exactly', () => {
    const edge = { panelRectangle: [{ x: 0, y: 0 }, { x: 640, y: 0 }, { x: 640, y: 640 }, { x: 0, y: 640 }], wireRoute: [{ x: 0, y: 0 }, { x: 640, y: 640 }] };
    expect(validatePage37Layout(edge, 640, 640)).toBe(edge);
  });

  it('rejects a panel "rectangle" that does not have exactly 4 corners', () => {
    expect(() => validatePage37Layout({ ...validLayout, panelRectangle: validLayout.panelRectangle.slice(0, 3) }, 640, 640)).toThrow(/exactly 4 corners/);
  });

  it('rejects a wire route with fewer than 2 points', () => {
    expect(() => validatePage37Layout({ ...validLayout, wireRoute: [{ x: 1, y: 1 }] }, 640, 640)).toThrow(/at least 2 points/);
  });

  it('rejects a degenerate (zero-area) panel quad', () => {
    const flat = [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 200, y: 10 }, { x: 300, y: 10 }];
    expect(() => validatePage37Layout({ ...validLayout, panelRectangle: flat }, 640, 640)).toThrow(/degenerate/);
  });
});

describe('isRetryablePage37LayoutError', () => {
  it('treats parse and out-of-bounds failures as retryable call failures (spec §5), and nothing else', () => {
    expect(isRetryablePage37LayoutError(new Page37LayoutParseError('x'))).toBe(true);
    expect(isRetryablePage37LayoutError(new Page37LayoutOutOfBoundsError('x'))).toBe(true);
    expect(isRetryablePage37LayoutError(new Error('400 invalid_request_error'))).toBe(false);
  });
});
