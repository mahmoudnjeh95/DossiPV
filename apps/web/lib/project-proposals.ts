import { proposeInstallations, type ProposeResult, type SizingContext } from '@dossipv/engine';
import { toIsoDate, type ProjectForEngine } from './project-engine-input';
import { loadSizingCatalog, missingLibraryKinds } from './sizing-catalog';
import { getSpecificYield } from './specific-yield';

/** Line reactance used for every proposal (the cabling form's default). */
const LAMBDA_OHM_PER_M = 0.00008;
/** Run lengths assumed until the installer places the points on the map. */
const DEFAULT_DC_LENGTH_M = 15;
const DEFAULT_AC_LENGTH_M = 10;

export type ProjectProposalsResult =
  | { ok: true; result: ProposeResult; context: SizingContext; yieldWarning: string | null }
  | { ok: false; missing: string[]; missingLibraryKinds: string[]; blockedReasons: string[] };

const NOT_SINGLE_PHASE = 'Le site doit être monophasé (abonné BT monophasé) pour les propositions automatiques.';
const LIGHTNING_ROD =
  'Un paratonnerre est déclaré sur le site : des parafoudres de type 1 sont requis, les propositions automatiques ne le gèrent pas encore.';

/**
 * Sizes up to three single-phase installations for a project from the company's library.
 * Nothing is sized while the client's need or the site is unknown (`missing`, French labels),
 * while the library lacks a kind of equipment (`missingLibraryKinds`), or while the site is one the
 * sizing does not model (`blockedReasons`: the candidates are validated as a single-phase site
 * without a lightning rod, so any other site could fail C12/C19 once the proposal is applied).
 */
export async function computeProjectProposals(project: ProjectForEngine, now: Date): Promise<ProjectProposalsResult> {
  const { site, company } = project;
  const annualConsumptionKWh = project.client?.annualConsumptionKWh ?? null;
  const subscribedPowerKVA = project.client?.subscribedPowerKVA ?? null;
  const missing: string[] = [];
  if (annualConsumptionKWh === null) missing.push('Consommation annuelle (kWh/an)');
  if (subscribedPowerKVA === null) missing.push('Puissance souscrite (kVA)');
  if (!site) missing.push('Site (position GPS)');
  const blockedReasons: string[] = [];
  if (site && site.phases !== 1) blockedReasons.push(NOT_SINGLE_PHASE);
  if (site?.lightningRod) blockedReasons.push(LIGHTNING_ROD);

  const catalog = await loadSizingCatalog(project.companyId);
  const lacking = missingLibraryKinds(catalog);
  if (
    annualConsumptionKWh === null ||
    subscribedPowerKVA === null ||
    !site ||
    lacking.length > 0 ||
    blockedReasons.length > 0
  ) {
    return { ok: false, missing, missingLibraryKinds: lacking, blockedReasons };
  }

  const specificYield = await getSpecificYield(site.gpsLat, site.gpsLon, site.tiltDeg, site.azimuthDeg ?? 0);
  const dcRun = project.cableRuns.find((run) => run.circuitType === 'DC');
  const acRun = project.cableRuns.find((run) => run.circuitType === 'AC');

  const context: SizingContext = {
    annualConsumptionKWh,
    subscribedPowerKVA,
    specificYieldKWhPerKWp: specificYield.value,
    averagePriceTNDPerKWh: project.billImport?.averagePriceTNDPerKWh ?? null,
    tMinC: company.defaultTMinC,
    tMaxC: company.defaultTMaxC,
    cosPhi: company.defaultCosPhi,
    lambdaOhmPerM: LAMBDA_OHM_PER_M,
    maxVoltageDropPct: company.defaultMaxVoltageDropPct,
    maxAcVoltageDropPct: company.defaultMaxAcVoltageDropPct,
    dcLengthM: dcRun?.lengthM ?? DEFAULT_DC_LENGTH_M,
    acLengthM: acRun?.lengthM ?? DEFAULT_AC_LENGTH_M,
    windSpeedKmh: company.defaultDesignWindSpeedKmh,
    tiltDeg: site.tiltDeg,
    gps: { lat: site.gpsLat, lon: site.gpsLon },
    dossierDate: toIsoDate(project.dossierDate ?? now),
    companyAccreditationValidTo: toIsoDate(company.anmeValidTo),
  };

  return { ok: true, result: proposeInstallations(catalog, context), context, yieldWarning: specificYield.warning };
}
