import { describe, it, expect } from 'vitest';
import { CHECK_LABELS } from '@dossipv/engine';
import { CHECK_HELP, checkFixHref } from '../lib/check-help';
import { JARGON } from '../lib/jargon';

describe('CHECK_HELP', () => {
  it('explains every engine check', () => {
    for (const id of Object.keys(CHECK_LABELS)) {
      expect(CHECK_HELP[id], id).toBeDefined();
      expect(CHECK_HELP[id]?.explain.length).toBeGreaterThan(30);
    }
  });

  it('shows the measured and expected figures the engine exposes', () => {
    expect(CHECK_HELP.C06?.facts({ POWER_RATIO: 1.45 })).toEqual(['Rapport actuel panneaux / onduleur : 1,45 (attendu : entre 0,9 et 1,3)']);
    expect(CHECK_HELP.C09?.facts({ STRING_VOC_TMIN: 612.34, ISC_FIELD_DESIGN: 13.2 })).toHaveLength(2);
    expect(CHECK_HELP.C04?.facts({ NP_MAX: 2 })).toEqual(['Maximum de chaînes en parallèle par entrée : 2']);
  });

  it('shows nothing it does not have', () => {
    expect(CHECK_HELP.C11?.facts({})).toEqual([]);
    expect(CHECK_HELP.C06?.facts({})).toEqual([]);
  });

  it('links to the section that fixes the check', () => {
    expect(checkFixHref('p1', CHECK_HELP.C09!.fix)).toBe('/projects/p1/sections/protections');
    expect(checkFixHref('p1', CHECK_HELP.C04!.fix)).toBe('/projects/p1/sections/array');
    expect(checkFixHref('p1', CHECK_HELP.C22!.fix)).toBe('/settings');
  });

  it('has a plain explanation for Nc, Ns and Np', () => {
    for (const word of ['Nc', 'Ns', 'Np']) expect(JARGON[word]).toBeTruthy();
  });
});
