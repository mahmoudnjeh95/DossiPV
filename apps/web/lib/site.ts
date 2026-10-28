/**
 * Public identity of the site, used by the metadata, robots.txt, sitemap.xml and structured data.
 *
 * The canonical address is the production domain, not APP_URL: the image is built once, without
 * the runtime environment, and search engines must only ever see one address (never the
 * 217.182.205.137:3001 fallback or localhost).
 */
export const SITE_URL = 'https://ai.solarixpro.com';
export const SITE_NAME = 'SolarixPro';
export const SITE_TITLE = 'SolarixPro | Logiciel de dossier technique photovoltaïque BT (STEG)';
export const SITE_DESCRIPTION =
  'SolarixPro génère en quelques minutes le dossier technique de vos installations photovoltaïques basse tension : ' +
  'import de la facture STEG, dimensionnement, contrôles électriques, schéma unifilaire, plan d’implantation et PDF prêt à déposer. ' +
  'Essai gratuit pour les installateurs.';
export const SITE_KEYWORDS = [
  'dossier technique photovoltaïque',
  'dossier STEG',
  'dossier PV basse tension',
  'logiciel photovoltaïque',
  'installateur photovoltaïque Tunisie',
  'schéma unifilaire photovoltaïque',
  'dimensionnement onduleur',
  'Prosol Elec',
  'autoconsommation',
  'panneaux solaires Tunisie',
];

/** Areas behind a login or a one-time token: kept out of search results. */
export const PRIVATE_PATHS = [
  '/admin',
  '/api',
  '/dashboard',
  '/projects',
  '/library',
  '/settings',
  '/facturation',
  '/fournisseur',
  '/paiement',
  '/conditions',
  '/invitation',
  '/verifier-email',
  '/reinitialiser-mot-de-passe',
];

/** For pages that must never be indexed, even when reached through a link. */
export const NO_INDEX = { index: false, follow: false } as const;
