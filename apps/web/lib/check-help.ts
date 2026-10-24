/** Where an installer fixes a failing check: a project section (or the company page). */
export interface CheckFix {
  /** Project section key (/projects/:id/sections/:key), or 'settings' for the company page. */
  section: 'client' | 'site' | 'array' | 'protections' | 'cabling' | 'structure' | 'earthing' | 'settings';
  label: string;
}

export interface CheckHelp {
  explain: string;
  fix: CheckFix;
  /** Measured and expected values the engine result already exposes (`derived`), when it has them. */
  facts: (derived: Record<string, number>) => string[];
}

const num = (value: number | undefined, decimals = 1, unit = ''): string | null =>
  value === undefined
    ? null
    : `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value)}${unit ? ` ${unit}` : ''}`;

/** « label : value », or nothing when the engine did not return the value. */
const fact = (label: string, value: number | undefined, decimals = 1, unit = '', suffix = ''): string[] => {
  const text = num(value, decimals, unit);
  return text === null ? [] : [`${label} : ${text}${suffix}`];
};

const fixArray: CheckFix = { section: 'array', label: 'Corriger le champ PV' };
const fixProtections: CheckFix = { section: 'protections', label: 'Corriger les protections' };
const fixCabling: CheckFix = { section: 'cabling', label: 'Corriger le câblage' };
const noFacts = (): string[] => [];

/**
 * A plain-French reading of each engine check: what it verifies, what to change and where. The
 * engine only returns a pass flag and a short message, so the numbers shown are the ones its
 * `derived` record carries (computed for the first inverter input).
 */
export const CHECK_HELP: Record<string, CheckHelp> = {
  C01: {
    explain:
      'Par grand froid les panneaux d’une chaîne produisent plus de tension : avec trop de panneaux en série, la tension dépasse ce que l’onduleur supporte (risque de destruction). Réduisez le nombre de panneaux par chaîne.',
    fix: fixArray,
    facts: (d) => [
      ...fact('Maximum de panneaux par chaîne pour cet onduleur', d.NS_MAX, 0),
      ...fact('Tension à vide d’une chaîne par grand froid (Voc)', d.STRING_VOC_TMIN, 1, 'V'),
    ],
  },
  C02: {
    explain:
      'Par forte chaleur la tension d’une chaîne baisse : avec trop peu de panneaux en série, elle passe sous le seuil de fonctionnement de l’onduleur et la production s’arrête. Ajoutez des panneaux en série.',
    fix: fixArray,
    facts: (d) => fact('Minimum de panneaux par chaîne pour cet onduleur', d.NS_MIN, 0),
  },
  C03: {
    explain:
      'Par temps froid la tension de la chaîne dépasse la plage optimale de l’onduleur : il écrêtera la production. Ce n’est pas bloquant, mais vous perdez un peu d’énergie.',
    fix: fixArray,
    facts: (d) => fact('Nombre de panneaux en série conseillé au maximum', d.NS_OPT_MAX, 0),
  },
  C04: {
    explain:
      'Trop de chaînes sont branchées en parallèle sur une entrée de l’onduleur : le courant de court-circuit dépasse ce que l’entrée supporte. Répartissez les chaînes sur plusieurs entrées ou réduisez-en le nombre.',
    fix: fixArray,
    facts: (d) => fact('Maximum de chaînes en parallèle par entrée', d.NP_MAX, 0),
  },
  C05: {
    explain: 'Le courant des chaînes en parallèle dépasse le courant normal de l’entrée : l’onduleur limitera la production. Ce n’est pas bloquant.',
    fix: fixArray,
    facts: (d) => fact('Chaînes en parallèle conseillées au maximum', d.NP_OPT, 0),
  },
  C06: {
    explain:
      'La puissance des panneaux doit rester proche de celle de l’onduleur (entre 0,9 et 1,3 fois). Hors de cette plage, l’onduleur est soit trop gros, soit saturé. Ajustez le nombre de panneaux ou choisissez un autre onduleur.',
    fix: fixArray,
    facts: (d) => fact('Rapport actuel panneaux / onduleur', d.POWER_RATIO, 2, '', ' (attendu : entre 0,9 et 1,3)'),
  },
  C07: {
    explain:
      'Par grand froid, la tension de la chaîne dépasse la tension maximale que le fabricant autorise pour le panneau. Réduisez le nombre de panneaux en série.',
    fix: fixArray,
    facts: (d) => fact('Tension d’une chaîne par grand froid', d.STRING_VOC_TMIN, 1, 'V'),
  },
  C08: {
    explain:
      'Quand il y a beaucoup de chaînes en parallèle, un défaut sur une chaîne peut être alimenté par les autres : des fusibles DC sont alors obligatoires, avec le bon calibre. Choisissez-les dans la section Protections.',
    fix: fixProtections,
    facts: (d) => fact('Chaînes en parallèle autorisées sans fusible', d.NC_MAX_NO_FUSE, 0),
  },
  C09: {
    explain:
      'L’interrupteur-sectionneur DC choisi ne supporte pas la tension ou le courant du champ photovoltaïque. Choisissez un modèle de tension et de courant nominaux plus élevés.',
    fix: fixProtections,
    facts: (d) => [
      ...fact('Tension à supporter (Voc de chaîne par grand froid), au minimum', d.STRING_VOC_TMIN, 1, 'V'),
      ...fact('Courant à supporter, au minimum', d.ISC_FIELD_DESIGN, 2, 'A'),
    ],
  },
  C10: {
    explain:
      'Le parafoudre DC choisi n’est pas adapté à la tension ou au courant du champ photovoltaïque. Choisissez un parafoudre DC de tension de service (Uc) plus élevée et de courant de décharge suffisant.',
    fix: fixProtections,
    facts: (d) => fact('Courant de champ à tenir', d.ISC_FIELD_DESIGN, 2, 'A'),
  },
  C11: {
    explain:
      'Le parafoudre laisse passer une tension résiduelle (Up) trop proche de ce que supportent les appareils à protéger. Choisissez un parafoudre au niveau de protection (Up) plus bas, ou rapprochez-le des équipements (moins de 10 m).',
    fix: fixProtections,
    facts: noFacts,
  },
  C12: {
    explain:
      'Un bâtiment équipé d’un paratonnerre exige des parafoudres de Type 1 côté DC et côté AC. Choisissez des parafoudres de Type 1, ou corrigez l’information « paratonnerre » dans la section Site.',
    fix: fixProtections,
    facts: noFacts,
  },
  C13: {
    explain:
      'Le calibre du disjoncteur AC doit être au moins égal au courant de sortie de l’onduleur (Iac) et ne pas dépasser le courant admissible du câble AC (Iz). Changez le disjoncteur ou la section du câble AC.',
    fix: fixProtections,
    facts: (d) => [
      ...fact('Courant de sortie de l’onduleur (Iac)', d.AC_DESIGN_CURRENT, 1, 'A'),
      ...fact('Courant admissible du câble AC (Iz corrigé)', d.AC_RUN_IZ_CORRECTED, 1, 'A'),
    ],
  },
  C14: {
    explain: 'La tension de service (Uc) du parafoudre AC est trop basse pour le réseau 230 V. Choisissez un parafoudre AC d’Uc au moins égale à 253 V.',
    fix: fixProtections,
    facts: noFacts,
  },
  C15: {
    explain:
      'Avec plusieurs onduleurs, un interrupteur-sectionneur général AC est obligatoire, et son calibre doit dépasser la somme des courants des onduleurs. Choisissez-le dans la section Protections.',
    fix: fixProtections,
    facts: (d) => fact('Somme des courants des onduleurs (Iac), à dépasser', d.AC_DESIGN_CURRENT, 1, 'A'),
  },
  C16: {
    explain: 'Le câble DC choisi chaufferait trop pour le courant du champ. Prenez une section de câble plus grande ou changez le mode de pose.',
    fix: fixCabling,
    facts: (d) => [
      ...fact('Courant admissible du câble (Iz corrigé)', d.DC_RUN_IZ_CORRECTED, 1, 'A'),
      ...fact('Courant du champ à tenir', d.ISC_FIELD_DESIGN, 2, 'A'),
    ],
  },
  C17: {
    explain: 'La perte de tension dans les câbles dépasse la limite fixée. Augmentez la section des câbles ou raccourcissez les longueurs.',
    fix: fixCabling,
    facts: (d) => [...fact('Chute de tension DC', d.DU_DC_PCT, 2, '%'), ...fact('Chute de tension AC', d.DU_AC_PCT, 2, '%')],
  },
  C18: {
    explain: 'Le poids du lest ne suffit pas à tenir les panneaux face au vent. Ajoutez des dalles ou augmentez leur poids dans la section Structure.',
    fix: { section: 'structure', label: 'Corriger la structure' },
    facts: (d) => [
      ...fact('Moment stabilisant (poids du lest)', d.STABILITY_LHS, 0),
      ...fact('Moment renversant (vent), à dépasser', d.STABILITY_RHS, 0),
    ],
  },
  C19: {
    explain: 'L’onduleur (monophasé ou triphasé) ne correspond pas à l’alimentation du site. Choisissez l’onduleur adapté, ou corrigez le nombre de phases du site.',
    fix: { section: 'site', label: 'Vérifier le site' },
    facts: noFacts,
  },
  C20: {
    explain: 'L’homologation d’un équipement est expirée à la date du dossier. Remplacez l’équipement ou mettez à jour sa date d’homologation dans votre bibliothèque.',
    fix: fixArray,
    facts: noFacts,
  },
  C21: {
    explain: 'L’onduleur choisi ne figure pas dans la liste des onduleurs acceptés par la STEG. Choisissez un onduleur de la liste STEG.',
    fix: fixArray,
    facts: noFacts,
  },
  C22: {
    explain: 'L’agrément ANME de votre société est expiré à la date du dossier. Mettez à jour les dates de validité dans les paramètres de la société.',
    fix: { section: 'settings', label: 'Mettre à jour mon agrément' },
    facts: noFacts,
  },
  C23: {
    explain:
      'La puissance des onduleurs dépasse la puissance souscrite par le client auprès de la STEG. Réduisez la puissance des onduleurs, ou corrigez la puissance souscrite dans la fiche client.',
    fix: { section: 'client', label: 'Vérifier la puissance souscrite' },
    facts: noFacts,
  },
  C24: {
    explain: 'Il manque une protection différentielle 30 mA de type A (ou F, B) côté AC. Choisissez un disjoncteur différentiel adapté dans la section Protections.',
    fix: fixProtections,
    facts: noFacts,
  },
};

/** The link that opens the place where a check is fixed. */
export function checkFixHref(projectId: string, fix: CheckFix): string {
  return fix.section === 'settings' ? '/settings' : `/projects/${projectId}/sections/${fix.section}`;
}
