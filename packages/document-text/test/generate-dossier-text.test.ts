import { describe, it, expect, vi } from 'vitest';
import { generateDossierText } from '../src/generate-dossier-text';
import { RawNumberLeakError } from '../src/validate-no-raw-numbers';
import type { DossierTextInput, DossierTextSections } from '../src/types';
import type Anthropic from '@anthropic-ai/sdk';

const sampleInput: DossierTextInput = {
  moduleBrandModel: 'LONGi LR7-72HGD-620M',
  inverterBrandModel: 'Sofar 1-4KTL2-G3',
  inverterCount: 1,
  gridType: 'BT',
  phases: 1,
  mountingType: 'FLAT_ROOF_BALLAST',
  structureMaterial: 'Aluminium',
  earthRodCount: 3,
  dcFuseRequired: false,
  acIsolatorRequired: false,
};

const cleanSections: DossierTextSections = {
  introduction: "Ce dossier présente l'installation de {P_DC_W} Wc.",
  solution: 'Solution technique proposée avec {NS} modules en série.',
  cabling: 'Câblage DC et AC conforme à la norme {NORME_REF}.',
  earthing: 'Mise à la terre avec {EARTH_ROD_COUNT} piquets.',
  structure: 'Structure en aluminium, lestage conforme.',
  conclusion: 'Installation conforme aux exigences STEG/ANME.',
};

/** Builds a fake Anthropic client whose messages.create returns a fixed structured-output result. */
function fakeClientReturning(parsedResult: unknown): Anthropic {
  return {
    messages: {
      parse: () => Promise.resolve({ parsed_output: parsedResult }),
    },
  } as unknown as Anthropic;
}

describe('generateDossierText', () => {
  it('returns the 6 sections when the client responds with clean placeholder-only text', async () => {
    const client = fakeClientReturning(cleanSections);
    const result = await generateDossierText(sampleInput, client, [
      'P_DC_W',
      'NS',
      'NORME_REF',
      'EARTH_ROD_COUNT',
    ]);
    expect(result).toEqual(cleanSections);
  });

  it('throws RawNumberLeakError when a section contains a literal number', async () => {
    const dirtySections: DossierTextSections = {
      ...cleanSections,
      introduction: 'Ce dossier présente une installation de 3100 Wc.',
    };
    const client = fakeClientReturning(dirtySections);
    await expect(
      generateDossierText(sampleInput, client, ['P_DC_W', 'NS', 'NORME_REF', 'EARTH_ROD_COUNT']),
    ).rejects.toThrow(RawNumberLeakError);
  });

  it('never includes client-identifying data in the prompt sent to the client', async () => {
    let capturedPrompt = '';
    const client = {
      messages: {
        parse: (params: { messages: Array<{ content: string }> }) => {
          capturedPrompt = params.messages[0]?.content ?? '';
          return Promise.resolve({ parsed_output: cleanSections });
        },
      },
    } as unknown as Anthropic;

    await generateDossierText(sampleInput, client, ['P_DC_W', 'NS', 'NORME_REF', 'EARTH_ROD_COUNT']);

    // sampleInput has no name/address/CIN fields at all (enforced by the
    // DossierTextInput type), so this is a structural guarantee, not just
    // a string check — but we still assert the prompt only contains the
    // technical fields we expect, nothing invented.
    expect(capturedPrompt).toContain(sampleInput.moduleBrandModel);
    expect(capturedPrompt).not.toMatch(/\bclient\b|\bnom\b|\badresse\b/i);
  });

  it('calls Claude with model claude-sonnet-5-5, not claude-opus-5-5', async () => {
    const mockParse = vi.fn(() => Promise.resolve({ parsed_output: cleanSections }));
    const mockClient = {
      messages: {
        parse: mockParse,
      },
    } as unknown as Anthropic;

    await generateDossierText(sampleInput, mockClient, ['P_DC_W']);

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5-5' }),
    );
  });
});
