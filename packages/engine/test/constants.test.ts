import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RHO_CU,
  RHO_AL,
  K1_BY_METHOD,
  K2_TRAY_PERFORATED_E_F,
  K2_ENCLOSED_B_C,
  K3_PR,
  K3_PVC,
  K4_LAYERS,
  branchementCalibre,
} from '../src/constants';

describe('constants', () => {
  it('rho values match x-rules.constants', () => {
    expect(RHO_CU).toBe(0.02314);
    expect(RHO_AL).toBe(0.037);
  });

  it('every constant table matches pv_dossier_input_schema.json x-rules.constants exactly', () => {
    const schemaPath: string = resolve(__dirname, '../../../pv_dossier_input_schema.json');
    const schemaFile: string = readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaFile) as Record<string, unknown>;
    const schemaConstants = (schema['x-rules'] as Record<string, unknown>)['constants'] as Record<string, unknown>;

    expect(K1_BY_METHOD).toEqual(schemaConstants.K1_byMethod);
    expect(K2_TRAY_PERFORATED_E_F).toEqual(schemaConstants.K2_trayPerforated_E_F);
    expect(K2_ENCLOSED_B_C).toEqual(schemaConstants.K2_enclosed_B_C);
    expect(K3_PR).toEqual(schemaConstants.K3_PR);
    expect(K3_PVC).toEqual(schemaConstants.K3_PVC);
    expect(K4_LAYERS).toEqual(schemaConstants.K4_layers);
    expect(RHO_CU).toBe(schemaConstants.rhoCu);
    expect(RHO_AL).toBe(schemaConstants.rhoAl);
  });
});

describe('branchementCalibre', () => {
  it('reads the STEG single-phase ladder', () => {
    expect(branchementCalibre(7)).toBe('30/32');
    expect(branchementCalibre(2)).toBe('10');
  });

  it('is null off the ladder', () => {
    expect(branchementCalibre(13)).toBeNull();
  });
});
