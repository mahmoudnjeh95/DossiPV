import { branchementCalibre, type EngineResult } from '@dossipv/engine';
import type { WorkerJobSnapshot, SnapshotEquipmentRef } from './job-snapshot';
import type { AcBoxInput, DcBoxInput, DeviceRating, EarthingDrawingInput, PanelWiringInput, SingleLineInput } from './render-drawings';
import type { DrawingCartouche } from './drawing-kit';

export interface DrawingInputs {
  singleLine: SingleLineInput;
  panelWiring: PanelWiringInput;
  dcBox: DcBoxInput;
  acBox: AcBoxInput;
}

export interface DrawingInputsContext {
  snapshot: WorkerJobSnapshot;
  engineResult: EngineResult;
  installer: { name: string; anmeCode: string };
  installedKWp: number;
  stegLogoBuffer: Buffer | null;
}

const frNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const fr = (value: number): string => frNumber.format(value);

const DEFAULT_DC_CABLE = 'H1Z2Z2-K';
const DEFAULT_AC_CABLE = 'U1000 R2V';

function brandModel(device: SnapshotEquipmentRef | null | undefined): string | null {
  return device ? `${device.brand} ${device.model}` : null;
}

function poleLine(device: Record<string, unknown> | null | undefined): string[] {
  const poles = device?.poles;
  return typeof poles === 'number' ? [`${poles} pôles`] : [];
}

function cableRef(snapshot: WorkerJobSnapshot, circuit: 'DC' | 'AC', fallback: string): string {
  const run = snapshot.cableRuns.find((r) => r.circuitType === circuit);
  return run?.cable?.model ?? fallback;
}

/**
 * The four electrical drawings' inputs. Ratings come from the same engine input and catalog
 * snapshot values the calculation notes print, so a drawing and its notes can never disagree.
 */
export function buildDrawingInputs({ snapshot, engineResult, installer, installedKWp, stegLogoBuffer }: DrawingInputsContext): DrawingInputs {
  const { engineInput, protections } = snapshot;
  const first = engineInput.array[0]!;
  const mppts = engineInput.array.flatMap((entry) => entry.mppts);
  const stringCount = mppts.reduce((sum, m) => sum + m.stringsInParallel, 0);
  const modulesPerString = mppts[0]?.modulesPerString ?? 0;
  const moduleCount = mppts.reduce((sum, m) => sum + m.stringsInParallel * m.modulesPerString, 0);
  const stringModules = mppts.flatMap((m) => Array.from({ length: m.stringsInParallel }, () => ({ modules: m.modulesPerString })));

  const dcCable = { ref: cableRef(snapshot, 'DC', DEFAULT_DC_CABLE), sectionMm2: engineInput.dcRun.sectionMm2, lengthM: engineInput.dcRun.lengthM };
  const acCable = { ref: cableRef(snapshot, 'AC', DEFAULT_AC_CABLE), sectionMm2: engineInput.acRun.sectionMm2, lengthM: engineInput.acRun.lengthM };

  const earthingRow = snapshot.earthing;
  const earthing: EarthingDrawingInput = {
    mode: snapshot.projectMeta.earthingMode === 'BUILDING_EARTH' ? 'BUILDING_EARTH' : 'DEDICATED_ROD',
    mainMm2: earthingRow?.mainEarthSectionMm2 ?? 0,
    frameMm2: earthingRow?.frameEarthSectionMm2 ?? 0,
    toPitMm2: earthingRow?.earthToPitSectionMm2 ?? 0,
    targetOhm: earthingRow?.targetResistanceOhm ?? 0,
  };

  const withModel = (device: SnapshotEquipmentRef | null | undefined, rest: string[]): string[] => {
    const name = brandModel(device);
    return name ? [name, ...rest] : rest;
  };

  const { dcSwitch, dcSpd, dcFuse: dcFuseInput, acBreaker, rcd } = {
    dcSwitch: engineInput.dcSwitch,
    dcSpd: engineInput.dcSpd,
    dcFuse: engineInput.dcFuse,
    acBreaker: engineInput.acBreaker,
    rcd: engineInput.rcd,
  };

  const dcSwitchRating: DeviceRating = {
    ref: 'Q1',
    label: 'Interrupteur-sectionneur DC',
    lines: withModel(protections?.dcSwitch, [`Un ${fr(dcSwitch.ratedVoltageV)} V`, `In ${fr(dcSwitch.ratedCurrentA)} A`, ...poleLine(protections?.dcSwitch)]),
  };
  const dcSpdRating: DeviceRating = {
    ref: 'SPD1',
    label: 'Parafoudre DC',
    lines: withModel(protections?.dcSpd, [`Type ${fr(dcSpd.type)}`, `Ucpv ${fr(dcSpd.ucV)} V`, `Up ${fr(dcSpd.upKV)} kV`, `In ${fr(dcSpd.inKA)} kA`]),
  };
  const dcFuse: DeviceRating | null = dcFuseInput
    ? { ref: 'F1', label: 'Fusible gPV', lines: withModel(protections?.dcFuse, [`In ${fr(dcFuseInput.ratedCurrentA)} A`, `Un ${fr(dcFuseInput.ratedVoltageV)} V`]) }
    : null;

  const breakerLines = [`In ${fr(acBreaker.ratedCurrentA)} A`];
  const breakerCurve = protections?.acBreaker?.curve;
  if (typeof breakerCurve === 'string') breakerLines.push(`courbe ${breakerCurve}`);
  const residual = rcd && rcd.residualCurrentMA !== null && rcd.rcdType !== null ? `${fr(rcd.residualCurrentMA)} mA type ${rcd.rcdType}` : null;
  if (residual) breakerLines.push(residual);
  breakerLines.push('2 pôles');
  const acBreakerRating: DeviceRating = {
    ref: 'Q2',
    label: residual ? 'Disjoncteur différentiel AC' : 'Disjoncteur AC',
    lines: withModel(protections?.acBreaker, breakerLines),
  };
  const acSpdInKA = typeof protections?.acSpd?.inKA === 'number' ? protections.acSpd.inKA : null;
  const acSpdRating: DeviceRating = {
    ref: 'SPD2',
    label: 'Parafoudre AC',
    lines: withModel(protections?.acSpd, [
      `Type ${fr(engineInput.acSpd.type)}`,
      `Uc ${fr(engineInput.acSpd.ucV)} V`,
      `Up ${fr(engineInput.acSpd.upKV)} kV`,
      ...(acSpdInKA === null ? [] : [`In ${fr(acSpdInKA)} kA`]),
    ]),
  };

  const inverterModel = brandModel(snapshot.arrayConfig?.inverters[0]?.inverter) ?? snapshot.projectMeta.inverterBrandModel;
  const inverterRating: DeviceRating = {
    ref: 'INV1',
    label: 'Onduleur',
    lines: [
      inverterModel,
      `Pac ${fr(first.inverter.pacW / 1000)} kW`,
      `${first.inverter.mpptCount} MPPT, ${first.inverter.phases === 1 ? 'monophasé' : 'triphasé'}${first.inverter.stegApproved === false ? '' : ', accepté STEG'}`,
    ],
  };

  const cartouche: DrawingCartouche = {
    projectTitle: `Installation PV ${fr(installedKWp)} kWc`,
    client: snapshot.client?.fullName ?? '',
    commune: snapshot.client?.address ?? '—',
    installerName: installer.name,
    anmeCode: installer.anmeCode,
    revision: 'A',
    date: snapshot.engineInput.dossierDate,
    dossierNumber: snapshot.dossierNumber,
    logo: stegLogoBuffer,
  };

  const subscribedKVA = snapshot.client?.subscribedPowerKVA ?? null;
  const agcp = { calibreA: subscribedKVA === null ? null : branchementCalibre(subscribedKVA) };

  return {
    singleLine: {
      pvField: {
        moduleRef: snapshot.projectMeta.moduleBrandModel,
        moduleCount,
        strings: stringCount,
        modulesPerString,
        stringVocTminV: engineResult.derived.STRING_VOC_TMIN ?? 0,
        iscA: engineInput.module.iscA,
      },
      dcCable,
      dcSwitch: dcSwitchRating,
      dcSpd: dcSpdRating,
      dcFuse,
      inverter: inverterRating,
      acCable,
      acBreaker: acBreakerRating,
      acSpd: acSpdRating,
      agcp,
      earthing,
      cartouche,
    },
    panelWiring: {
      strings: stringModules,
      moduleRef: snapshot.projectMeta.moduleBrandModel,
      dcCable: { ref: dcCable.ref, sectionMm2: dcCable.sectionMm2 },
      frameMm2: earthing.frameMm2,
      toPitMm2: earthing.toPitMm2,
      earthing,
      cartouche,
    },
    dcBox: { strings: stringCount, dcSwitch: dcSwitchRating, dcSpd: dcSpdRating, dcFuse, dcCable, earthing, cartouche },
    acBox: { acBreaker: acBreakerRating, acSpd: acSpdRating, acCable, earthing, agcp, cartouche },
  };
}
