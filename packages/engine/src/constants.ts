/**
 * NF C 15-100 correction factor tables and resistivity constants.
 * Transcribed verbatim from pv_dossier_input_schema.json x-rules.constants.
 * test/constants.test.ts diffs this file against the schema on every run to catch drift.
 */

export const RHO_CU = 0.02314;
export const RHO_AL = 0.037;

export const K3_PR: Record<string, number> = {
  '10': 1.15,
  '15': 1.12,
  '20': 1.08,
  '25': 1.04,
  '30': 1.0,
  '35': 0.96,
  '40': 0.91,
  '45': 0.87,
  '50': 0.82,
  '55': 0.76,
  '60': 0.71,
  '65': 0.65,
  '70': 0.58,
  '75': 0.5,
  '80': 0.41,
};

export const K3_PVC: Record<string, number> = {
  '10': 1.22,
  '15': 1.17,
  '20': 1.12,
  '25': 1.06,
  '30': 1.0,
  '35': 0.94,
  '40': 0.87,
  '45': 0.79,
  '50': 0.71,
  '55': 0.61,
  '60': 0.5,
};

export const K1_BY_METHOD: Record<string, number> = {
  '1': 0.77,
  '2': 0.7,
  '3': 1.0,
  '3A': 0.9,
  '4': 1.0,
  '4A': 0.9,
  '5': 1.0,
  '5A': 0.9,
  '11': 1.0,
  '11A': 0.95,
  '12': 1.0,
  '13': 1.0,
  '14': 1.0,
  '16': 1.0,
  '17': 1.0,
  '18': 1.21,
};

export const K2_TRAY_PERFORATED_E_F: number[] = [
  1.0, 0.88, 0.82, 0.77, 0.75, 0.73, 0.73, 0.72, 0.72,
];

export const K2_ENCLOSED_B_C: number[] = [
  1.0, 0.8, 0.7, 0.65, 0.6, 0.55, 0.55, 0.5, 0.5, 0.45, 0.4, 0.4,
];

export const K4_LAYERS: Record<string, number> = {
  '1': 1.0,
  '2': 0.8,
  '3': 0.73,
  '4': 0.7,
  '5': 0.7,
  '6': 0.68,
  '7': 0.68,
  '8': 0.68,
  '9': 0.66,
};
