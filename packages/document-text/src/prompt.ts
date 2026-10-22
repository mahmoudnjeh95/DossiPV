import type { DossierTextInput } from './types';

/**
 * System prompt: fixed rules that never change between calls. Kept as its
 * own exported string so it can be unit tested for the exact wording the
 * "no raw numbers" guarantee depends on, independent of any one project's
 * data.
 */
export const DOSSIER_TEXT_SYSTEM_PROMPT = `Tu rédiges les sections descriptives d'un dossier technique photovoltaïque en français, dans le style administratif d'un dossier soumis à la STEG/ANME en Tunisie.

Règle absolue : n'écris JAMAIS un chiffre dans ta réponse, pour quelque raison que ce soit — ni une valeur calculée (puissance, tension, courant, nombre de modules...), ni une référence de norme (par exemple "NF C 15-100"), ni un numéro de section. Chaque fois qu'un chiffre serait nécessaire, utilise à la place un espace réservé entre accolades, en respectant strictement la liste fermée d'espaces réservés autorisés qui te sera donnée dans le message suivant — n'utilise jamais un nom en dehors de cette liste. Une application lira ta réponse et remplacera chaque espace réservé par la vraie valeur. Si tu écris un seul chiffre réel, ou un espace réservé absent de la liste fournie, le dossier sera rejeté automatiquement.

Important : la valeur qui remplacera un espace réservé inclut déjà son unité quand une unité s'applique (un espace réservé de puissance sera remplacé par une valeur suivie de "W", un espace réservé de pourcentage par une valeur suivie de "%", etc.). N'ajoute donc JAMAIS toi-même une unité (W, V, A, %...) immédiatement après un espace réservé — cela produirait une unité en double dans le texte final.

Tu ne connais jamais le nom, l'adresse ou les coordonnées du client — n'en invente jamais et n'y fais jamais référence.

Réponds uniquement avec les 6 sections demandées, dans un français clair et professionnel.`;

/**
 * Builds the user-turn prompt from one project's technical data. Only
 * non-personal fields from DossierTextInput are ever interpolated here —
 * see types.ts's doc comment for the PII boundary this depends on.
 */
export function buildDossierTextUserPrompt(
  input: DossierTextInput,
  allowedPlaceholderNames: string[],
): string {
  return `Rédige les 6 sections du dossier technique pour cette installation photovoltaïque :

- Module : {MODULE_REF}
- Onduleur(s) : {INVERTER_REF}, nombre d'onduleurs : {INVERTER_COUNT}
- Raccordement : ${input.gridType}, réseau ${input.phases === 1 ? 'monophasé' : 'triphasé'}
- Type de pose : ${input.mountingType}
- Structure : ${input.structureMaterial}
- Mise à la terre : {EARTH_ROD_COUNT} piquets de terre
- Fusible DC requis : ${input.dcFuseRequired ? 'oui' : 'non'}

Appareils de protection installés (liste exhaustive) :
${input.protectionLines.map((line) => `- ${line}`).join('\n')}

Ne mentionne aucun autre appareil de protection que ceux de cette liste. Ne parle de protection différentielle que si elle y figure. Le sectionnement côté AC est assuré par l'appareil désigné ci-dessus : n'écris pas qu'un organe de sectionnement n'est pas requis.

Rédige :
1. introduction — présentation générale du projet
2. solution — description de la solution technique proposée
3. cabling — description du câblage DC et AC${input.dcFuseRequired ? ' (incluant la section fusible DC)' : ''}
4. earthing — description de la mise à la terre
5. structure — description de la structure et du lestage
6. conclusion — conclusion du dossier

Espaces réservés autorisés — n'utilise AUCUN espace réservé en dehors de cette liste : ${allowedPlaceholderNames
    .map((name) => `{${name}}`)
    .join(', ')}.

Rappel : aucun chiffre réel, uniquement des espaces réservés entre accolades, et uniquement parmi la liste ci-dessus.`;
}
