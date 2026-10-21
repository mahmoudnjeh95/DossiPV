import type { PvModuleInput, InverterInput, MpptConfig, EngineResult } from './types';
import type { ConductorType, InsulationType, ReferenceMethod } from './cabling';
import type { RunEngineInput } from './run-engine';

/** Equipment the installer can use, as the sizing functions see it (one company's library). */
export interface CatalogModule extends PvModuleInput { id: string; brand: string; model: string; homologationValidTo: string | null }
export interface CatalogInverter extends InverterInput { id: string; brand: string; model: string; homologationValidTo: string | null }
export interface CatalogDcSwitch { id: string; brand: string; model: string; ratedVoltageV: number; ratedCurrentA: number }
export interface CatalogDcFuse { id: string; brand: string; model: string; ratedCurrentA: number; ratedVoltageV: number }
export interface CatalogSpd { id: string; brand: string; model: string; side: 'DC' | 'AC'; type: number; ucV: number; upKV: number; inKA: number; iscpvKA: number | null }
export interface CatalogAcBreaker { id: string; brand: string; model: string; ratedCurrentA: number }
export interface CatalogCable { id: string; brand: string; model: string; usage: 'DC_SOLAR' | 'AC' | 'EARTH'; conductor: ConductorType; insulation: InsulationType; sections: { sectionMm2: number; izA: number; izReferenceMethod: ReferenceMethod }[] }
export interface SizingCatalog { modules: CatalogModule[]; inverters: CatalogInverter[]; dcSwitches: CatalogDcSwitch[]; dcFuses: CatalogDcFuse[]; spds: CatalogSpd[]; acBreakers: CatalogAcBreaker[]; cables: CatalogCable[] }

/** The client's need and the site/project defaults every candidate is sized against. */
export interface SizingContext {
  annualConsumptionKWh: number; subscribedPowerKVA: number; specificYieldKWhPerKWp: number;
  averagePriceTNDPerKWh: number | null;
  tMinC: number; tMaxC: number; cosPhi: number; lambdaOhmPerM: number; maxVoltageDropPct: number;
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
