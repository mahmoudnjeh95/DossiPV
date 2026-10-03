import { describe, it, expect } from 'vitest';
import { substitutePlaceholders, MissingPlaceholderValueError } from '../src/substitute-placeholders';
import type { DossierTextSections } from '../src/types';

const sections: DossierTextSections = {
  introduction: "Puissance crête de {P_DC_KWC} kWc, norme {NORME_INSTALLATION_BT}.",
  solution: 'Le générateur comprend {N_MODULES} modules en {N_STRINGS} chaîne(s).',
  cabling: 'Section DC de {SECTION_DC_MM2} mm², chute de tension {DU_DC_PCT} %.',
  earthing: '{EARTH_ROD_COUNT} piquet(s) de terre, résistance visée {R_TERRE_MAX_OHM} Ω.',
  structure: 'Inclinaison de {INCLINAISON_DEG}°, masse de lest {MASSE_LEST_KG} kg.',
  conclusion: 'Production annuelle estimée {PRODUCTION_ANNUELLE_KWH} kWh.',
};

const values: Record<string, string | number> = {
  P_DC_KWC: 3.1,
  NORME_INSTALLATION_BT: 'NF C 15-100',
  N_MODULES: 5,
  N_STRINGS: 1,
  SECTION_DC_MM2: 6,
  DU_DC_PCT: 0.88,
  EARTH_ROD_COUNT: 3,
  R_TERRE_MAX_OHM: 25,
  INCLINAISON_DEG: 30,
  MASSE_LEST_KG: 750,
  PRODUCTION_ANNUELLE_KWH: 4760,
};

describe('substitutePlaceholders', () => {
  it('replaces every {PLACEHOLDER} in every section with its value from the map', () => {
    const result = substitutePlaceholders(sections, values);
    expect(result.introduction).toBe('Puissance crête de 3.1 kWc, norme NF C 15-100.');
    expect(result.solution).toBe('Le générateur comprend 5 modules en 1 chaîne(s).');
    expect(result.cabling).toBe('Section DC de 6 mm², chute de tension 0.88 %.');
    expect(result.earthing).toBe('3 piquet(s) de terre, résistance visée 25 Ω.');
    expect(result.structure).toBe('Inclinaison de 30°, masse de lest 750 kg.');
    expect(result.conclusion).toBe('Production annuelle estimée 4760 kWh.');
  });

  it('leaves text with no placeholders unchanged', () => {
    const noPlaceholders: DossierTextSections = {
      introduction: 'Texte fixe sans aucun espace réservé.',
      solution: '',
      cabling: '',
      earthing: '',
      structure: '',
      conclusion: '',
    };
    const result = substitutePlaceholders(noPlaceholders, {});
    expect(result.introduction).toBe('Texte fixe sans aucun espace réservé.');
  });

  it('substitutes the same placeholder every time it appears, even repeated in one section', () => {
    const repeated: DossierTextSections = {
      introduction: 'Puissance {P_DC_KWC} kWc, soit {P_DC_KWC} kWc crête.',
      solution: '',
      cabling: '',
      earthing: '',
      structure: '',
      conclusion: '',
    };
    const result = substitutePlaceholders(repeated, { P_DC_KWC: 3.1 });
    expect(result.introduction).toBe('Puissance 3.1 kWc, soit 3.1 kWc crête.');
  });

  it('throws MissingPlaceholderValueError when a placeholder in the text has no matching value', () => {
    const withMissing: DossierTextSections = {
      introduction: 'Puissance de {P_DC_KWC} kWc.',
      solution: '',
      cabling: '',
      earthing: '',
      structure: '',
      conclusion: '',
    };
    expect(() => substitutePlaceholders(withMissing, {})).toThrow(
      MissingPlaceholderValueError,
    );
  });

  it('names the missing placeholder and the section in the thrown error', () => {
    const withMissing: DossierTextSections = {
      introduction: 'Texte avec {UNKNOWN_FIELD} dedans.',
      solution: '',
      cabling: '',
      earthing: '',
      structure: '',
      conclusion: '',
    };
    try {
      substitutePlaceholders(withMissing, {});
      throw new Error('expected substitutePlaceholders to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MissingPlaceholderValueError);
      expect((error as Error).message).toContain('UNKNOWN_FIELD');
      expect((error as Error).message).toContain('introduction');
    }
  });

  it('does not require every value in the map to be used — extra values are harmless', () => {
    const onePlaceholder: DossierTextSections = {
      introduction: 'Seulement {P_DC_KWC} ici.',
      solution: '',
      cabling: '',
      earthing: '',
      structure: '',
      conclusion: '',
    };
    const result = substitutePlaceholders(onePlaceholder, {
      P_DC_KWC: 3.1,
      UNUSED_VALUE: 999,
    });
    expect(result.introduction).toBe('Seulement 3.1 ici.');
  });
});
