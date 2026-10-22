import type { EngineResult, RunEngineInput } from '@dossipv/engine';
import type { SnapshotEquipmentRef, WorkerJobSnapshot } from './job-snapshot';
import { ANNEX_NUMBERS, ANNEX_TITLES, annexDocumentsFromSnapshot, type AnnexSlot } from './annex-plan';

export interface LabelValueRow {
  label: string;
  value: string;
}

export interface EquipmentTables {
  /** Annexes N°1 to N°10, `—` where the project has no document. */
  documentationRows: { designation: string; annex: string }[];
  equipmentRows: { designation: string; quantity: string; brand: string; reference: string; annex: string }[];
  moduleSpecRows: LabelValueRow[];
  /** One table per inverter of the array. */
  inverterSpecTables: { inverterLabel: string; rows: LabelValueRow[] }[];
  deviceRatingRows: { device: string; ratings: string }[];
}

export interface EquipmentTablesInput {
  snapshot: WorkerJobSnapshot;
  engineInput: RunEngineInput;
  engineResult: EngineResult;
  /** True when the project holds the structure conformity attestation (annex N°3). */
  hasStructureAttestation: boolean;
}

const frNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const fr = (value: number): string => frNumber.format(value);
const NONE = '—';

type Device = (SnapshotEquipmentRef & Record<string, unknown>) | null | undefined;

function num(device: Device, key: string): number | null {
  const value = device?.[key];
  return typeof value === 'number' ? value : null;
}

function text(device: Device, key: string): string | null {
  const value = device?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** `value unit`, or `—` when the catalog row has no such number. */
function withUnit(value: number | null, unit: string): string {
  return value === null ? NONE : `${fr(value)} ${unit}`;
}

function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** Slots that hold at least one document of the project, with the always-rendered ones. */
function slotsWithDocuments(snapshot: WorkerJobSnapshot, hasStructureAttestation: boolean): Set<AnnexSlot> {
  const slots = new Set(annexDocumentsFromSnapshot(snapshot, { anmeCertificateFileId: null }, null, null).map((document) => document.slot));
  // The installer's ANME agreement is required to generate; the PVGIS report, the drawings and
  // the plans are rendered for every dossier; the STEG list page follows an accepted inverter.
  for (const slot of ['ADMIN', 'SIMULATION', 'SINGLE_LINE', 'IMPLANTATION', 'SITUATION', 'PANEL_WIRING', 'DC_BOX', 'AC_BOX'] as const) slots.add(slot);
  if (hasStructureAttestation) slots.add('STRUCTURE');
  if (snapshot.arrayConfig?.inverters.some(({ inverter }) => inverter.stegApproved === true)) slots.add('INVERTER_HOMOLOGATION');
  return slots;
}

function moduleSpecRows(module: Device): LabelValueRow[] {
  const dimensions = num(module, 'lengthMm') !== null && num(module, 'widthMm') !== null ? `${fr(num(module, 'lengthMm')!)} × ${fr(num(module, 'widthMm')!)} mm` : NONE;
  return [
    { label: 'Marque', value: module?.brand ?? NONE },
    { label: 'Référence', value: module?.model ?? NONE },
    { label: 'Puissance crête Pmax', value: withUnit(num(module, 'pmaxW'), 'W') },
    { label: 'Tension Vmp', value: withUnit(num(module, 'vmpV'), 'V') },
    { label: 'Courant Imp', value: withUnit(num(module, 'impA'), 'A') },
    { label: 'Tension Voc', value: withUnit(num(module, 'vocV'), 'V') },
    { label: 'Courant Isc', value: withUnit(num(module, 'iscA'), 'A') },
    { label: 'Coefficient de température Voc (β)', value: withUnit(num(module, 'tempCoeffVocPct'), '%/°C') },
    { label: 'Coefficient de température Isc (α)', value: withUnit(num(module, 'tempCoeffIscPct'), '%/°C') },
    { label: 'Coefficient de température Pmax', value: withUnit(num(module, 'tempCoeffPmaxPct'), '%/°C') },
    { label: 'Courant inverse max (IRM)', value: withUnit(num(module, 'irmA'), 'A') },
    { label: 'Tension système max', value: withUnit(num(module, 'maxSystemVoltageV'), 'V') },
    { label: 'Dimensions', value: dimensions },
    { label: 'Masse', value: withUnit(num(module, 'weightKg'), 'kg') },
  ];
}

function inverterSpecRows(inverter: Device): LabelValueRow[] {
  const validTo = text(inverter, 'homologationValidTo');
  const stegApproved = inverter?.stegApproved === true;
  const range = text(inverter, 'vacRangeV');
  const mpptMin = num(inverter, 'mpptMinV');
  const mpptMax = num(inverter, 'mpptMaxV');
  return [
    { label: 'Marque', value: inverter?.brand ?? NONE },
    { label: 'Référence', value: inverter?.model ?? NONE },
    { label: 'Puissance AC Pac', value: withUnit(num(inverter, 'pacW'), 'W') },
    { label: 'Puissance apparente Sac', value: withUnit(num(inverter, 'sacVA'), 'VA') },
    { label: 'Tension DC max', value: withUnit(num(inverter, 'vdcMaxV'), 'V') },
    { label: 'Plage MPPT', value: mpptMin !== null && mpptMax !== null ? `${fr(mpptMin)} – ${fr(mpptMax)} V` : NONE },
    { label: 'Tension de démarrage', value: withUnit(num(inverter, 'startUpV'), 'V') },
    { label: 'Nombre de MPPT', value: num(inverter, 'mpptCount') === null ? NONE : fr(num(inverter, 'mpptCount')!) },
    { label: 'Entrées par MPPT', value: num(inverter, 'inputsPerMppt') === null ? NONE : fr(num(inverter, 'inputsPerMppt')!) },
    { label: 'Idc max par MPPT', value: withUnit(num(inverter, 'idcMaxPerMpptA'), 'A') },
    { label: 'Isc max par MPPT', value: withUnit(num(inverter, 'iscMaxPerMpptA'), 'A') },
    { label: 'Tension AC nominale', value: withUnit(num(inverter, 'vacNomV'), 'V') },
    ...(range ? [{ label: 'Plage de tension AC', value: `${range} V` }] : []),
    { label: 'Iac max', value: withUnit(num(inverter, 'iacMaxA'), 'A') },
    { label: 'Homologation STEG', value: stegApproved ? (validTo ? `Oui, valable jusqu'au ${formatIsoDate(validTo)}` : 'Oui') : 'Non' },
  ];
}

/** The documentation, equipment, characteristics and device-rating tables of the dossier body. */
export function buildEquipmentTables({ snapshot, engineInput, engineResult, hasStructureAttestation }: EquipmentTablesInput): EquipmentTables {
  const slots = slotsWithDocuments(snapshot, hasStructureAttestation);
  const annexOf = (slot: AnnexSlot): string => (slots.has(slot) ? String(ANNEX_NUMBERS[slot]) : NONE);

  const documentationRows = (Object.keys(ANNEX_NUMBERS) as AnnexSlot[])
    .filter((slot) => ANNEX_NUMBERS[slot] <= 10)
    .sort((a, b) => ANNEX_NUMBERS[a] - ANNEX_NUMBERS[b])
    .map((slot) => ({ designation: `N°${ANNEX_NUMBERS[slot]} — ${ANNEX_TITLES[slot]}`, annex: annexOf(slot) }));

  const { protections, cablingConfig } = snapshot;
  const module = snapshot.arrayConfig?.module;
  const inverters = snapshot.arrayConfig?.inverters ?? [];
  const moduleCount = engineResult.derived.MODULE_COUNT ?? 0;
  const acBreaker = protections?.acBreaker;
  const differential = typeof acBreaker?.residualCurrentMA === 'number';
  const dcRun = snapshot.cableRuns.find((run) => run.circuitType === 'DC');
  const acRun = snapshot.cableRuns.find((run) => run.circuitType === 'AC');
  const earthCable = snapshot.earthing?.earthCable;

  const row = (designation: string, device: Device, slot: AnnexSlot, quantity: string | null): EquipmentTables['equipmentRows'][number] =>
    device && quantity !== null
      ? { designation, quantity, brand: device.brand, reference: device.model, annex: annexOf(slot) }
      : { designation, quantity: NONE, brand: NONE, reference: NONE, annex: NONE };

  const equipmentRows = [
    row('Modules photovoltaïques', module, 'MODULE', fr(moduleCount)),
    row('Onduleur', inverters[0]?.inverter, 'INVERTER', fr(inverters.length)),
    row('Fusible DC', protections?.dcFuse, 'DC_FUSE', '1'),
    row('Parafoudre DC', protections?.dcSpd, 'DC_SPD', '1'),
    row('Interrupteur-sectionneur DC', protections?.dcSwitch, 'DC_SWITCH', '1'),
    row('Parafoudre AC', protections?.acSpd, 'AC_SPD', '1'),
    row('Interrupteur-sectionneur AC', protections?.acIsolator, 'AC_ISOLATOR', '1'),
    row(differential ? 'Disjoncteur différentiel AC' : 'Disjoncteur AC', acBreaker, differential ? 'RCD' : 'AC_MAIN_BREAKER', '1'),
    row('Câble DC', dcRun?.cable, 'DC_CABLE', dcRun ? `${fr(dcRun.lengthM)} m` : null),
    row('Câble AC', acRun?.cable, 'AC_CABLE', acRun ? `${fr(acRun.lengthM)} m` : null),
    row('Câble de terre', earthCable, 'EARTH_CABLE', '1'),
    row('Connecteur MC4', cablingConfig?.connector, 'CONNECTOR', '1'),
    row('Répartiteur de terre', snapshot.earthing?.distributionBlock, 'DISTRIBUTION_BLOCK', '1'),
    row('Chemin de câbles', cablingConfig?.cableTray, 'CABLE_TRAY', '1'),
  ];

  const derived = engineResult.derived;
  const { dcSwitch, dcSpd, dcFuse, acSpd } = engineInput;
  const rating = (device: string, ratings: string): { device: string; ratings: string } => ({ device, ratings });
  const deviceRatingRows = [
    ...(dcFuse ? [rating('Fusible DC', `Un ${fr(dcFuse.ratedVoltageV)} V / In ${fr(dcFuse.ratedCurrentA)} A`)] : []),
    rating('Parafoudre DC', `Type ${fr(dcSpd.type)} · Ucpv ${fr(dcSpd.ucV)} V · Up ${fr(dcSpd.upKV)} kV · In ${fr(dcSpd.inKA)} kA · Iscpv ${fr(dcSpd.iscpvKA)} kA`),
    rating('Interrupteur-sectionneur DC', `Ue ${fr(dcSwitch.ratedVoltageV)} V DC · In ${fr(dcSwitch.ratedCurrentA)} A${num(protections?.dcSwitch, 'poles') === null ? '' : ` · ${fr(num(protections?.dcSwitch, 'poles')!)} pôles`}`),
    rating(
      differential ? 'Disjoncteur différentiel AC' : 'Disjoncteur AC',
      [
        '2 pôles',
        `In ${fr(engineInput.acBreaker.ratedCurrentA)} A`,
        ...(text(acBreaker, 'curve') ? [`courbe ${text(acBreaker, 'curve')}`] : []),
        ...(num(acBreaker, 'breakingCapacityKA') !== null ? [`Icn ${fr(num(acBreaker, 'breakingCapacityKA')!)} kA`] : []),
        ...(engineInput.rcd && engineInput.rcd.residualCurrentMA !== null && engineInput.rcd.rcdType !== null ? [`${fr(engineInput.rcd.residualCurrentMA)} mA type ${engineInput.rcd.rcdType}`] : []),
      ].join(' · '),
    ),
    rating('Parafoudre AC', `Type ${fr(acSpd.type)} · Uc ${fr(acSpd.ucV)} V · Up ${fr(acSpd.upKV)} kV${num(protections?.acSpd, 'inKA') === null ? '' : ` · In ${fr(num(protections?.acSpd, 'inKA')!)} kA`}`),
    rating('Câble DC', `${dcRun?.cable?.model ?? 'Câble DC'} ${fr(engineInput.dcRun.sectionMm2)} mm² · Iz' ${fr(derived.DC_RUN_IZ_CORRECTED ?? 0)} A`),
    rating('Câble AC', `${acRun?.cable?.model ?? 'Câble AC'} ${fr(engineInput.acRun.sectionMm2)} mm² · Iz' ${fr(derived.AC_RUN_IZ_CORRECTED ?? 0)} A`),
    rating('Paratonnerre', `Paratonnerre sur le site : ${engineInput.site.lightningRod ? 'oui' : 'non'}`),
  ];

  return {
    documentationRows,
    equipmentRows,
    moduleSpecRows: moduleSpecRows(module),
    inverterSpecTables: inverters.map(({ inverter }, i) => ({ inverterLabel: `Onduleur ${i + 1}`, rows: inverterSpecRows(inverter) })),
    deviceRatingRows,
  };
}
