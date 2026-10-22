/**
 * A neutral French label for each engine check, stating the requirement the check verifies —
 * unlike `CheckResult.message`, which words the failure. Printed in the dossier's compliance table.
 */
export const CHECK_LABELS: Record<string, string> = {
  C01: 'Tension Voc à Tmin inférieure à la tension DC maximale de l\'onduleur',
  C02: 'Tension Vmp à Tmax dans la plage MPPT et au-dessus de la tension de démarrage',
  C03: 'Tension Vmp à Tmin dans la plage MPPT',
  C04: 'Courant Isc du champ inférieur à l\'Isc maximal du MPPT',
  C05: 'Courant Imp du champ inférieur à l\'Idc maximal du MPPT',
  C06: 'Rapport DC/AC compris entre 0,9 et 1,3',
  C07: 'Tension de chaîne à Tmin inférieure à la tension système maximale du module',
  C08: 'Fusible DC présent et calibré lorsque le nombre de chaînes en parallèle l\'exige',
  C09: 'Interrupteur-sectionneur DC dimensionné pour la tension et le courant du champ',
  C10: 'Parafoudre DC dimensionné pour la tension et le courant du champ',
  C11: 'Niveau de protection du parafoudre compatible avec la tenue aux chocs des équipements',
  C12: 'Type des parafoudres adapté à la présence ou non d\'un paratonnerre',
  C13: 'Calibre du disjoncteur AC compris entre l\'Iac de l\'onduleur et l\'Iz\' du câble',
  C14: 'Tension de service du parafoudre AC suffisante',
  C15: 'Interrupteur-sectionneur général AC présent lorsque plusieurs onduleurs sont installés',
  C16: 'Courant admissible du câble DC supérieur au courant de conception du champ',
  C17: 'Chutes de tension DC et AC dans les limites autorisées',
  C18: 'Stabilité au vent de la structure',
  C19: 'Nombre de phases du site compatible avec celui de l\'onduleur',
  C20: 'Homologations des équipements valables à la date du dossier',
  C21: 'Onduleur présent dans la liste STEG des onduleurs acceptés',
  C22: 'Agrément ANME de l\'installateur valide à la date du dossier',
  C23: 'Puissance AC totale des onduleurs inférieure ou égale à la puissance souscrite',
  C24: 'Protection différentielle 30 mA de type A (ou F, B) côté AC',
};
