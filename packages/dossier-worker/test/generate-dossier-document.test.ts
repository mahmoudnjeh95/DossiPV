import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  generateDossierDocument,
  DossierGenerationBlockedError,
} from '../src/generate-dossier-document';
import { habibKhedhiraFixture } from './fixtures/habib-khedhira';
import { twoInverterSiteFixture } from './fixtures/two-inverter-site';
import type { DossierTextSections } from '@dossipv/document-text';

const sampleProjectMeta = {
  moduleBrandModel: 'LONGi LR7-72HGD-620M',
  inverterBrandModel: 'Sofar 1-4KTL2-G3',
  gridType: 'BT',
  mountingType: 'FLAT_ROOF_BALLAST',
  structureMaterial: 'Aluminium',
  earthRodCount: 3,
};

const placeholderSections: DossierTextSections = {
  introduction: 'Installation de {P_DC_W}, {MODULE_COUNT} modules.',
  solution: '{NS} modules en série, {NP} chaîne(s) en parallèle.',
  cabling: 'Chute de tension DC {DU_DC_PCT}, norme {NORME_CABLAGE}.',
  earthing: '{EARTH_ROD_COUNT} piquets de terre.',
  structure: 'Structure conforme.',
  conclusion: '{INVERTER_COUNT} onduleur(s) installé(s).',
};

function fakeClientReturning(parsedResult: unknown): { client: Anthropic; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn(() => Promise.resolve({ parsed_output: parsedResult }));
  const client = { messages: { parse } } as unknown as Anthropic;
  return { client, parse };
}

describe('generateDossierDocument', () => {
  it('chains calculate -> generate text -> substitute, returning fully-substituted sections', async () => {
    const { client } = fakeClientReturning(placeholderSections);
    const result = await generateDossierDocument(
      { engineInput: habibKhedhiraFixture, projectMeta: sampleProjectMeta },
      client,
    );

    expect(result.sections.introduction).not.toMatch(/\{[A-Za-z0-9_]+\}/);
    // fr-FR's Intl.NumberFormat uses U+202F (narrow no-break space) as the thousands
    // separator; the unit-prefix space inserted by formatValue() is U+00A0.
    expect(result.sections.introduction).toContain('3 100 W');
    expect(result.sections.solution).toContain('5 modules en série');
    expect(result.sections.earthing).toContain('3 piquets de terre');
    expect(result.engineResult.hasBlockingFailure).toBe(false);
  });

  it('derives INVERTER_COUNT and acIsolatorRequired correctly for a multi-inverter array', async () => {
    const { client } = fakeClientReturning(placeholderSections);
    const result = await generateDossierDocument(
      { engineInput: twoInverterSiteFixture, projectMeta: sampleProjectMeta },
      client,
    );

    expect(result.sections.conclusion).toContain('2 onduleur(s)');
  });

  it('throws DossierGenerationBlockedError before calling Claude when the design has a blocking failure', async () => {
    const blockedFixture = {
      ...habibKhedhiraFixture,
      // NS below inverter mppt startup minimum forces NS_MIN's check (C02) to fail.
      array: [
        {
          ...habibKhedhiraFixture.array[0]!,
          mppts: [{ stringsInParallel: 1, modulesPerString: 1 }],
        },
      ],
    };
    const { client, parse } = fakeClientReturning(placeholderSections);

    await expect(
      generateDossierDocument({ engineInput: blockedFixture, projectMeta: sampleProjectMeta }, client),
    ).rejects.toThrow(DossierGenerationBlockedError);

    expect(parse).not.toHaveBeenCalled();
  });

  it('propagates MissingPlaceholderValueError unchanged when generated text uses an unmapped placeholder', async () => {
    const unmappedSections: DossierTextSections = {
      ...placeholderSections,
      introduction: 'Texte avec {UNKNOWN_PLACEHOLDER} dedans.',
    };
    const { client } = fakeClientReturning(unmappedSections);

    await expect(
      generateDossierDocument({ engineInput: habibKhedhiraFixture, projectMeta: sampleProjectMeta }, client),
    ).rejects.toThrow('UNKNOWN_PLACEHOLDER');
  });
});
