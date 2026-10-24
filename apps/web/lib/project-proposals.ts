import { proposeInstallations, type Proposal, type ProposeResult, type SizingCatalog, type SizingContext } from '@dossipv/engine';
import { PROFILE_INCOMPLETE_MESSAGE } from './labels';
import { loadHighlightedProducts } from './highlight';
import { toIsoDate, type ProjectForEngine } from './project-engine-input';
import { isSponsored } from './sponsorship';
import { loadHighlightedSizingItems, loadSizingCatalog, missingLibraryKinds } from './sizing-catalog';
import { getSpecificYield } from './specific-yield';

/** Line reactance used for every proposal (the cabling form's default). */
const LAMBDA_OHM_PER_M = 0.00008;
/** Run lengths assumed until the installer places the points on the map. */
const DEFAULT_DC_LENGTH_M = 15;
const DEFAULT_AC_LENGTH_M = 10;

/** The equipment the installer fixed (by library id) before recomputing; null or absent leaves the choice to the sizing. */
export interface EquipmentSelection {
  moduleId?: string | null;
  inverterId?: string | null;
}

/** A library item the installer may pick, as shown in the selector. */
export interface EquipmentChoice {
  id: string;
  label: string;
}

/** The "Proposition sponsorisée": the RECOMMENDED result of the sizing run on the highlighted products. */
export interface SponsoredProposal {
  proposal: Proposal;
  /** The suppliers highlighting its panel or inverter, for the label. */
  suppliers: string[];
  /** Their SupplierProduct ids, to count the display and the application. */
  productIds: string[];
}

export type ProjectProposalsResult =
  | {
      ok: true;
      sponsored?: SponsoredProposal;
      result: ProposeResult;
      context: SizingContext;
      yieldWarning: string | null;
      choices: { modules: EquipmentChoice[]; inverters: EquipmentChoice[] };
    }
  | { ok: false; missing: string[]; missingLibraryKinds: string[]; blockedReasons: string[] };

const NOT_SINGLE_PHASE = 'Le site doit être monophasé (abonné BT monophasé) pour les propositions automatiques.';
const LIGHTNING_ROD =
  'Un paratonnerre est déclaré sur le site : des parafoudres de type 1 sont requis, les propositions automatiques ne le gèrent pas encore.';

/**
 * Sizes up to three single-phase installations for a project from the company's library.
 * The installer may fix the panel and/or the inverter (`selection`): only that equipment is then sized, so the figures follow it.
 * Nothing is sized while the client's need or the site is unknown (`missing`, French labels),
 * while the library lacks a kind of equipment (`missingLibraryKinds`), or while the site is one the
 * sizing does not model (`blockedReasons`: the candidates are validated as a single-phase site
 * without a lightning rod, so any other site could fail C12/C19 once the proposal is applied).
 */
export async function computeProjectProposals(
  project: ProjectForEngine,
  now: Date,
  selection: EquipmentSelection = {},
): Promise<ProjectProposalsResult> {
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
  // The ANME validity of a self sign-up is a placeholder (2000-01-01) until Paramètres is filled: proposals would all fail C22.
  if (company.profileComplete === false) blockedReasons.push(PROFILE_INCOMPLETE_MESSAGE);

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

  const choices = {
    modules: catalog.modules.map((m) => ({ id: m.id, label: `${m.brand} ${m.model} (${m.pmaxW} W)` })),
    inverters: catalog.inverters
      .filter((i) => i.phases === 1)
      .map((i) => ({ id: i.id, label: `${i.brand} ${i.model} (${i.pacW / 1000} kW)` })),
  };
  // An id no longer in the library (deleted since the page was shown) is ignored rather than blocking the sizing.
  const modules = catalog.modules.filter((m) => !selection.moduleId || m.id === selection.moduleId);
  const inverters = catalog.inverters.filter((i) => !selection.inverterId || i.id === selection.inverterId);
  const narrowed = {
    ...catalog,
    modules: modules.length > 0 ? modules : catalog.modules,
    inverters: inverters.length > 0 ? inverters : catalog.inverters,
  };

  const sponsored = await computeSponsoredProposal(project.companyId, catalog, selection, context);

  return {
    ok: true,
    result: proposeInstallations(narrowed, context),
    context,
    yieldWarning: specificYield.warning,
    choices,
    ...(sponsored ? { sponsored } : {}),
  };
}

/**
 * The sponsored pass (spec §6.2) for a direct installer: panels and inverters are the products
 * highlighted right now (in the installer's library or not), every other kind comes from the library.
 * Highlighted products from several suppliers go through ONE sizing, so the best technical fit wins
 * and no supplier buys a ranking against another. Only a RECOMMENDED result is returned: the engine
 * checks are the same as for any proposal, and a failing pass shows nothing sponsored.
 * A panel or inverter the installer fixed is respected only when it is highlighted, else the pass is skipped.
 */
async function computeSponsoredProposal(
  companyId: string,
  catalog: SizingCatalog,
  selection: EquipmentSelection,
  context: SizingContext,
): Promise<SponsoredProposal | null> {
  try {
    if (await isSponsored(companyId)) return null;
    const highlighted = await loadHighlightedProducts();
    if (highlighted.moduleIds.length === 0 && highlighted.inverterIds.length === 0) return null;
    if (selection.moduleId && !highlighted.moduleIds.includes(selection.moduleId)) return null;
    if (selection.inverterId && !highlighted.inverterIds.includes(selection.inverterId)) return null;

    const items = await loadHighlightedSizingItems(
      selection.moduleId ? [selection.moduleId] : highlighted.moduleIds,
      selection.inverterId ? [selection.inverterId] : highlighted.inverterIds,
    );
    if (items.modules.length === 0 && items.inverters.length === 0) return null;
    // A kind nobody highlights (or whose highlighted items the engine cannot read) stays the library's.
    const result = proposeInstallations(
      {
        ...catalog,
        modules: items.modules.length > 0 ? items.modules : catalog.modules,
        inverters: items.inverters.length > 0 ? items.inverters : catalog.inverters,
      },
      context,
    );
    const proposal = result.proposals.find((p) => p.kinds.includes('RECOMMENDED'));
    if (!proposal) return null;

    const ids = [proposal.candidate.module.id, proposal.candidate.inverter.id];
    const suppliers = [...new Set(ids.flatMap((id) => highlighted.suppliers[id] ?? []))];
    // Neither its panel nor its inverter is highlighted: the library's own result, nothing to label as sponsored.
    if (suppliers.length === 0) return null;
    return { proposal, suppliers, productIds: [...new Set(ids.flatMap((id) => highlighted.productIds[id] ?? []))] };
  } catch {
    // The sponsored proposal is a bonus: a failure here never hides the installer's own proposals.
    return null;
  }
}
