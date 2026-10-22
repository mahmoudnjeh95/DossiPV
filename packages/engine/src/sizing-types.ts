import type { PvModuleInput, InverterInput, MpptConfig, EngineResult } from './types';
import type { ConductorType, InsulationType, ReferenceMethod } from './cabling';
import type { RunEngineInput } from './run-engine';
import type { RcdType } from './checks';

/** Equipment the installer can use, as the sizing functions see it (one company's library). */
export interface CatalogModule extends PvModuleInput { id: string; brand: string; model: string; homologationValidTo: string | null }
export interface CatalogInverter extends InverterInput { id: string; brand: string; model: string; homologationValidTo: string | null }
export interface CatalogDcSwitch { id: string; brand: string; model: string; ratedVoltageV: number; ratedCurrentA: number }
export interface CatalogDcFuse { id: string; brand: string; model: string; ratedCurrentA: number; ratedVoltageV: number }
export interface CatalogSpd { id: string; brand: string; model: string; side: 'DC' | 'AC'; type: number; ucV: number; upKV: number; inKA: number; iscpvKA: number | null }
/** `residualCurrentMA`/`rcdType` are null for a plain breaker (no differential function). */
export interface CatalogAcBreaker { id: string; brand: string; model: string; ratedCurrentA: number; residualCurrentMA: number | null; rcdType: RcdType | null }
export interface CatalogCable { id: string; brand: string; model: string; usage: 'DC_SOLAR' | 'AC' | 'EARTH'; conductor: ConductorType; insulation: InsulationType; sections: { sectionMm2: number; izA: number; izReferenceMethod: ReferenceMethod }[] }
export interface SizingCatalog { modules: CatalogModule[]; inverters: CatalogInverter[]; dcSwitches: CatalogDcSwitch[]; dcFuses: CatalogDcFuse[]; spds: CatalogSpd[]; acBreakers: CatalogAcBreaker[]; cables: CatalogCable[] }

/** The client's need and the site/project defaults every candidate is sized against. */
export interface SizingContext {
  annualConsumptionKWh: number; subscribedPowerKVA: number; specificYieldKWhPerKWp: number;
  averagePriceTNDPerKWh: number | null;
  tMinC: number; tMaxC: number; cosPhi: number; lambdaOhmPerM: number; maxVoltageDropPct: number; maxAcVoltageDropPct: number;
  dcLengthM: number; acLengthM: number; windSpeedKmh: number; tiltDeg: number;
  gps: { lat: number; lon: number }; dossierDate: string; companyAccreditationValidTo: string;
}

export interface CableChoice { cableId: string; sectionMm2: number; lengthM: number }

/** One complete installation: its equipment, the engine input built from it, and the engine's verdict. */
export interface Candidate {
  module: CatalogModule; inverter: CatalogInverter; modulesPerString: number; stringCount: number; mppts: MpptConfig[];
  dcSwitchId: string; dcFuseId: string | null; dcSpdId: string; acBreakerId: string; acSpdId: string;
  dcCable: CableChoice; acCable: CableChoice; earthCableId: string;
  engineInput: RunEngineInput; engineResult: EngineResult;
}

export type BuildCandidateResult = { ok: true; candidate: Candidate } | { ok: false; reason: string };

/** The objective a proposal wins: closest to the need, fewest modules, or most production. */
export type ProposalKind = 'RECOMMENDED' | 'ECONOMIC' | 'MAX_PRODUCTION';

/** One installation shown to the client, with the figures that justify it. */
export interface Proposal {
  key: string;                 // `${module.id}|${inverter.id}|${modulesPerString}x${stringCount}`
  kinds: ProposalKind[];       // one candidate may win several objectives
  candidate: Candidate;
  moduleCount: number; dcPowerKWp: number; acPowerKW: number;
  annualProductionKWh: number; coveragePct: number; roofAreaM2: number;
  yearlySavingTND: number | null; explanation: string;
}

/** `stats.combinations`: string layouts enumerated (capped by MAX_COMBOS); `engineRuns`: buildCandidate calls. */
export interface ProposeResult { proposals: Proposal[]; noSolutionReasons: string[]; stats: { combinations: number; engineRuns: number } }
