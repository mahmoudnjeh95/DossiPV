import type { DossierTextInput } from './types';

/**
 * System prompt: fixed rules that never change between calls. Kept as its
 * own exported string so it can be unit tested for the exact wording the
 * "no raw numbers" guarantee depends on, independent of any one project's
 * data.
 */
export const DOSSIER_TEXT_SYSTEM_PROMPT = `Tu rédiges les sections descriptives d'un dossier technique photovoltaïque en français, dans le style administratif d'un dossier soumis à la STEG/ANME en Tunisie.

Règle absolue : n'écris JAMAIS un chiffre dans ta réponse, pour quelque raison que ce soit — ni une valeur calculée (puissance, tension, courant, nombre de modules...), ni une référence de norme (par exemple "NF C 15-100"), ni un numéro de section. Chaque fois qu'un chiffre serait nécessaire, utilise à la place un espace réservé entre accolades, par exemple {P_DC_W}, {NS}, ou {NORME_CABLAGE}. Une application lira ta réponse et remplacera chaque espace réservé par la vraie valeur. Si tu écris un seul chiffre réel au lieu d'un espace réservé, le dossier sera rejeté automatiquement.

Tu ne connais jamais le nom, l'adresse ou les coordonnées du client — n'en invente jamais et n'y fais jamais référence.

Réponds uniquement avec les 6 sections demandées, dans un français clair et professionnel.`;

/**
 * Builds the user-turn prompt from one project's technical data. Only
 * non-personal fields from DossierTextInput are ever interpolated here —
 * see types.ts's doc comment for the PII boundary this depends on.
 */
export function buildDossierTextUserPrompt(input: DossierTextInput): string {
  return `Rédige les 6 sections du dossier technique pour cette installation photovoltaïque :

- Module : ${input.moduleBrandModel}
- Onduleur(s) : ${input.inverterBrandModel}, nombre d'onduleurs : {INVERTER_COUNT}
- Raccordement : ${input.gridType}, réseau ${input.phases === 1 ? 'monophasé' : 'triphasé'}
- Type de pose : ${input.mountingType}
- Structure : ${input.structureMaterial}
- Mise à la terre : {EARTH_ROD_COUNT} piquets de terre
- Fusible DC requis : ${input.dcFuseRequired ? 'oui' : 'non'}
- Interrupteur-sectionneur général AC requis : ${input.acIsolatorRequired ? 'oui' : 'non'}

Rédige :
1. introduction — présentation générale du projet
2. solution — description de la solution technique proposée
3. cabling — description du câblage DC et AC${input.dcFuseRequired ? ' (incluant la section fusible DC)' : ''}
4. earthing — description de la mise à la terre
5. structure — description de la structure et du lestage
6. conclusion — conclusion du dossier

Rappel : aucun chiffre réel, uniquement des espaces réservés entre accolades.`;
}
