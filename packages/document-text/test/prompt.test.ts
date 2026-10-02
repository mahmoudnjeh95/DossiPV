import { describe, it, expect } from 'vitest';
import { buildDossierTextUserPrompt, DOSSIER_TEXT_SYSTEM_PROMPT } from '../src/prompt';
import type { DossierTextInput } from '../src/types';

const sampleInput: DossierTextInput = {
  moduleBrandModel: 'LONGi LR7-72HGD-620M',
  inverterBrandModel: 'Sofar 1-4KTL2-G3',
  inverterCount: 1,
  gridType: 'BT',
  phases: 1,
  mountingType: 'FLAT_ROOF_BALLAST',
  structureMaterial: 'Aluminium',
  earthRodCount: 3,
  dcFuseRequired: true,
  acIsolatorRequired: true,
};

describe('DOSSIER_TEXT_SYSTEM_PROMPT', () => {
  it('instructs the model to never write a real number', () => {
    expect(DOSSIER_TEXT_SYSTEM_PROMPT).toMatch(/jamais.*chiffre/i);
  });

  it('instructs the model to never reference client identity', () => {
    expect(DOSSIER_TEXT_SYSTEM_PROMPT).toMatch(/nom.*client|client.*nom/i);
  });

  it('does not frame placeholder names as mere examples — the user turn supplies the closed list', () => {
    // Spec §3.3: Claude must be told the placeholder vocabulary is closed, not illustrated
    // by a couple of examples it could extrapolate from. "par exemple {P_DC_W}..." was
    // exactly that loose framing; the design spec replaced it with an enumerated allowlist
    // (supplied in the user turn). The norm-reference example ("par exemple NF C 15-100")
    // is a different, legitimate use of "par exemple" and is not what this test targets.
    expect(DOSSIER_TEXT_SYSTEM_PROMPT).not.toMatch(/par exemple \{/i);
  });
});

describe('buildDossierTextUserPrompt', () => {
  it('includes the equipment brand/model fields', () => {
    const prompt = buildDossierTextUserPrompt(sampleInput, ['INVERTER_COUNT', 'EARTH_ROD_COUNT']);
    expect(prompt).toContain('LONGi LR7-72HGD-620M');
    expect(prompt).toContain('Sofar 1-4KTL2-G3');
  });

  it('mentions the fuse section only when dcFuseRequired is true', () => {
    const withFuse = buildDossierTextUserPrompt(
      { ...sampleInput, dcFuseRequired: true },
      ['INVERTER_COUNT', 'EARTH_ROD_COUNT'],
    );
    const withoutFuse = buildDossierTextUserPrompt(
      { ...sampleInput, dcFuseRequired: false },
      ['INVERTER_COUNT', 'EARTH_ROD_COUNT'],
    );
    expect(withFuse).toContain('fusible DC');
    expect(withoutFuse).not.toContain('(incluant la section fusible DC)');
  });

  it('never embeds the inverter count or earth rod count as a literal number — always a placeholder', () => {
    const prompt = buildDossierTextUserPrompt(sampleInput, ['INVERTER_COUNT', 'EARTH_ROD_COUNT']);
    expect(prompt).toContain('{INVERTER_COUNT}');
    expect(prompt).toContain('{EARTH_ROD_COUNT}');
    // The count values themselves (1 inverter, 3 earth rods) must never appear as a
    // standalone number — only inside {PLACEHOLDER} tokens or as part of a brand/model
    // string (e.g. "Sofar 1-4KTL2-G3", where "1" is part of the product name, not a count).
    expect(prompt).not.toMatch(/\bnombre d'onduleurs\s*:\s*\d/);
    expect(prompt).not.toMatch(/\d+\s*piquets de terre/);
  });

  it('lists every allowed placeholder name explicitly, not just examples', () => {
    const allowedNames = ['P_DC_W', 'NS', 'NORME_CABLAGE'];
    const prompt = buildDossierTextUserPrompt(sampleInput, allowedNames);
    expect(prompt).toContain('{P_DC_W}');
    expect(prompt).toContain('{NS}');
    expect(prompt).toContain('{NORME_CABLAGE}');
  });
});
