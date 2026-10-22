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

/**
 * Plain French name of every install method that has a K1 factor, worded after NF C 15-100
 * table 52C, with its code (STEG remark 10: the dossier must not print bare codes). Not part of
 * the schema's x-rules.constants, so constants.test.ts does not diff it.
 */
export const INSTALL_METHOD_LABELS: Record<string, string> = {
  '1': 'Conducteurs isolés sous conduit encastré dans une paroi thermiquement isolante (mode de pose 1)',
  '2': 'Câble multiconducteur sous conduit encastré dans une paroi thermiquement isolante (mode de pose 2)',
  '3': 'Conducteurs isolés sous conduit en montage apparent (mode de pose 3)',
  '3A': 'Conduit en montage apparent (mode de pose 3A)',
  '4': 'Conducteurs isolés sous conduit profilé en montage apparent (mode de pose 4)',
  '4A': 'Conduit profilé en montage apparent (mode de pose 4A)',
  '5': 'Conducteurs isolés sous conduit encastré dans une paroi (mode de pose 5)',
  '5A': 'Conduit encastré dans une paroi (mode de pose 5A)',
  '11': 'Câble fixé sur un mur (mode de pose 11)',
  '11A': 'Câble fixé à un plafond (mode de pose 11A)',
  '12': 'Chemin de câbles ou tablette non perforés (mode de pose 12)',
  '13': 'Chemin de câbles perforé (mode de pose 13)',
  '14': 'Corbeaux ou chemin de câbles en treillis soudé (mode de pose 14)',
  '16': 'Échelle à câbles (mode de pose 16)',
  '17': 'Câble suspendu à un câble porteur ou autoporteur (mode de pose 17)',
  '18': 'Conducteurs nus ou isolés sur isolateurs (mode de pose 18)',
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

/**
 * STEG single-phase branchement: the AGCP (disjoncteur de branchement) rating in amperes by
 * subscribed power in kVA.
 */
export const STEG_SINGLE_PHASE_BRANCHEMENT_A: Record<number, string> = {
  2: '10',
  3: '15',
  4: '20',
  7: '30/32',
  10: '45',
  14: '63',
  22: '100',
  27: '125',
  35: '160',
  50: '225',
};

/** The AGCP rating for a subscribed power, or null when the power is not on STEG's ladder. */
export function branchementCalibre(kVA: number): string | null {
  return STEG_SINGLE_PHASE_BRANCHEMENT_A[kVA] ?? null;
}
