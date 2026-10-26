/**
 * Who publishes SolarixPro and the version of its terms, shown on /cgu, /confidentialite and
 * /mentions-legales. A value left null prints "à compléter": fill them all before the launch.
 *
 * Changing the text of the CGU or of the privacy policy in a way users must agree to again: bump
 * TERMS_VERSION (the date of the new text). Every user is then asked to accept it at the next page
 * they open (/conditions).
 */
export const TERMS_VERSION = '2026-10-26';

export interface LegalEntity {
  /** Raison sociale, e.g. "SolarixPro SARL". */
  name: string | null;
  /** Forme juridique and capital, e.g. "SARL au capital de 10 000 TND". */
  legalForm: string | null;
  /** Identifiant unique au Registre National des Entreprises. */
  rneId: string | null;
  /** Matricule fiscal. */
  taxId: string | null;
  address: string | null;
  /** Directeur de la publication (the legal representative). */
  publisher: string | null;
  /** Receipt number of the INPDP declaration of the processing. */
  inpdpDeclaration: string | null;
  /** The company hosting the servers, with its address. */
  host: string | null;
}

export const LEGAL_ENTITY: LegalEntity = {
  name: null,
  legalForm: null,
  rneId: null,
  taxId: null,
  address: null,
  publisher: null,
  inpdpDeclaration: null,
  host: null,
};

/** The services personal data passes through, listed in the privacy policy. Keep in step with the code. */
export const SUBPROCESSORS: ReadonlyArray<{ name: string; purpose: string; country: string }> = [
  { name: 'Anthropic PBC (Claude)', purpose: 'lecture des factures STEG importées et rédaction des textes du dossier', country: 'États-Unis' },
  { name: 'Google (Map Tiles)', purpose: 'photos aériennes et vues 3D du site, à partir de ses coordonnées', country: 'États-Unis' },
  { name: 'Esri (ArcGIS) et Mapbox', purpose: 'fonds de carte satellite, à partir des coordonnées du site', country: 'États-Unis' },
  { name: 'Commission européenne, JRC (PVGIS)', purpose: 'simulation de production, à partir des seules coordonnées du site', country: 'Union européenne' },
  { name: 'Sentry', purpose: 'suivi des erreurs techniques, sans données personnelles', country: 'États-Unis' },
  { name: 'Google (Drive)', purpose: 'copie de sauvegarde hors du serveur, chiffrée avant envoi et illisible par Google', country: 'États-Unis' },
];

export const PLACEHOLDER = 'à compléter';

/** True when the user has not accepted the current terms (never, or an older version). */
export function needsTermsAcceptance(acceptedVersion: string | null | undefined): boolean {
  return acceptedVersion !== TERMS_VERSION;
}
