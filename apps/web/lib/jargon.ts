/** Plain-French meaning of the electrical abbreviations shown to installers (tooltips). */
export const JARGON: Record<string, string> = {
  Ns: 'Nombre de panneaux en série dans une chaîne.',
  Np: 'Nombre de chaînes branchées en parallèle sur une même entrée de l’onduleur.',
  Nc: 'Nombre de chaînes en parallèle. Au-delà de « Nc max », des fusibles DC sont obligatoires.',
  Voc: 'Tension à vide d’un panneau (sans charge) : elle monte quand il fait froid.',
  Vmp: 'Tension d’un panneau à sa puissance maximale.',
  Isc: 'Courant de court-circuit d’un panneau.',
  Imp: 'Courant d’un panneau à sa puissance maximale.',
  Iz: 'Courant maximal que le câble peut supporter sans chauffer.',
  Iac: 'Courant alternatif délivré par l’onduleur.',
  MPPT: 'Entrée de l’onduleur qui suit le point de puissance maximale des panneaux.',
  Uc: 'Tension maximale de service du parafoudre.',
  Up: 'Niveau de protection du parafoudre : tension résiduelle laissée passer lors d’une surtension.',
  Idc: 'Courant continu maximal accepté par une entrée de l’onduleur.',
};

/** Matches every abbreviation of JARGON as a whole word. */
export const JARGON_PATTERN = new RegExp(`\\b(${Object.keys(JARGON).join('|')})\\b`, 'g');
