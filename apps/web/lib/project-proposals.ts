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
  | { ok: false; missing: string[]; missingLibraryKinds: string[] };

/**
 * Sizes up to three single-phase installations for a project from the company's library.
 * Nothing is sized while the client's need or the site is unknown (`missing`, French labels)
 * or while the library lacks a kind of equipment (`missingLibraryKinds`).
 */
export async function computeProjectProposals(project: ProjectForEngine, now: Date): Promise<ProjectProposalsResult> {
  const { site, company } = project;
  const annualConsumptionKWh = project.client?.annualConsumptionKWh ?? null;
  const subscribedPowerKVA = project.client?.subscribedPowerKVA ?? null;
  const missing: string[] = [];
  if (annualConsumptionKWh === null) missing.push('Consommation annuelle (kWh/an)');
  if (subscribedPowerKVA === null) missing.push('Puissance souscrite (kVA)');
  if (!site) missing.push('Site (position GPS)');

  const catalog = await loadSizingCatalog(project.companyId);
  const lacking = missingLibraryKinds(catalog);
  if (annualConsumptionKWh === null || subscribedPowerKVA === null || !site || lacking.length > 0) {
    return { ok: false, missing, missingLibraryKinds: lacking };
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
