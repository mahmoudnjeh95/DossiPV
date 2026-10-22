import type { SnapshotEquipmentRef, WorkerJobSnapshot } from './job-snapshot';

/**
 * The dossier's annexes, numbered like the reference dossier (N°1 dossier administratif …
 * N°25 chemin de câbles). A slot that does not apply to the project stays in the plan with no
 * documents, so the bordereau still lists it as « sans objet ».
 */
export type AnnexSlot =
  | 'ADMIN'
  | 'SIMULATION'
  | 'STRUCTURE'
  | 'SINGLE_LINE'
  | 'IMPLANTATION'
  | 'SITUATION'
  | 'PANEL_WIRING'
  | 'DC_BOX'
  | 'AC_BOX'
  | 'INVERTER_HOMOLOGATION'
  | 'MODULE'
  | 'INVERTER'
  | 'DC_FUSE'
  | 'DC_SPD'
  | 'DC_SWITCH'
  | 'AC_SPD'
  | 'AC_ISOLATOR'
  | 'RCD'
  | 'AC_MAIN_BREAKER'
  | 'DC_CABLE'
  | 'AC_CABLE'
  | 'EARTH_CABLE'
  | 'CONNECTOR'
  | 'DISTRIBUTION_BLOCK'
  | 'CABLE_TRAY';

export const ANNEX_NUMBERS: Record<AnnexSlot, number> = {
  ADMIN: 1,
  SIMULATION: 2,
  STRUCTURE: 3,
  SINGLE_LINE: 4,
  IMPLANTATION: 5,
  SITUATION: 6,
  PANEL_WIRING: 7,
  DC_BOX: 8,
  AC_BOX: 9,
  INVERTER_HOMOLOGATION: 10,
  MODULE: 11,
  INVERTER: 12,
  DC_FUSE: 13,
  DC_SPD: 14,
  DC_SWITCH: 15,
  AC_SPD: 16,
  AC_ISOLATOR: 17,
  RCD: 18,
  AC_MAIN_BREAKER: 19,
  DC_CABLE: 20,
  AC_CABLE: 21,
  EARTH_CABLE: 22,
  CONNECTOR: 23,
  DISTRIBUTION_BLOCK: 24,
  CABLE_TRAY: 25,
};

export const ANNEX_TITLES: Record<AnnexSlot, string> = {
  ADMIN: 'Dossier administratif',
  SIMULATION: 'Simulation de production PVGIS',
  STRUCTURE: 'Attestation de conformité de la structure',
  SINGLE_LINE: 'Schéma unifilaire',
  IMPLANTATION: "Plan d'implantation et de connexion",
  SITUATION: 'Plan de situation',
  PANEL_WIRING: 'Câblage des panneaux',
  DC_BOX: 'Câblage du coffret DC',
  AC_BOX: 'Câblage du coffret AC',
  INVERTER_HOMOLOGATION: "Homologation de l'onduleur (liste STEG)",
  MODULE: 'Fiche technique du module',
  INVERTER: "Fiche technique de l'onduleur",
  DC_FUSE: 'Fusible DC',
  DC_SPD: 'Parafoudre DC',
  DC_SWITCH: 'Interrupteur-sectionneur DC',
  AC_SPD: 'Parafoudre AC',
  AC_ISOLATOR: 'Interrupteur-sectionneur AC',
  RCD: 'Disjoncteur différentiel',
  AC_MAIN_BREAKER: 'Disjoncteur AC général',
  DC_CABLE: 'Câble DC',
  AC_CABLE: 'Câble AC',
  EARTH_CABLE: 'Câble de terre',
  CONNECTOR: 'Connecteurs MC4',
  DISTRIBUTION_BLOCK: 'Répartiteur de terre',
  CABLE_TRAY: 'Chemin de câbles',
};

/** Physical order of appended documents (reference dossier order). */
export const ANNEX_PHYSICAL_ORDER: AnnexSlot[] = [
  'ADMIN',
  'SIMULATION',
  'STRUCTURE',
  'SINGLE_LINE',
  'IMPLANTATION',
  'SITUATION',
  'PANEL_WIRING',
  'DC_BOX',
  'AC_BOX',
  'MODULE',
  'INVERTER',
  'INVERTER_HOMOLOGATION',
  'DC_FUSE',
  'DC_SPD',
  'DC_SWITCH',
  'AC_SPD',
  'AC_ISOLATOR',
  'RCD',
  'AC_MAIN_BREAKER',
  'DC_CABLE',
  'AC_CABLE',
  'EARTH_CABLE',
  'CONNECTOR',
  'DISTRIBUTION_BLOCK',
  'CABLE_TRAY',
];

export interface AnnexDocument {
  slot: AnnexSlot;
  label: string;
  source: { kind: 'file'; fileId: string } | { kind: 'fragment'; buffer: Buffer };
}

export interface AnnexEntry {
  slot: AnnexSlot;
  number: number;
  title: string;
  /** May be empty: the slot is then « sans objet » for this project. */
  documents: AnnexDocument[];
}

const ALL_SLOTS = (Object.keys(ANNEX_NUMBERS) as AnnexSlot[]).sort((a, b) => ANNEX_NUMBERS[a] - ANNEX_NUMBERS[b]);

/** All 25 slots in number order, each with its documents in input order. */
export function buildAnnexPlan(documents: AnnexDocument[]): AnnexEntry[] {
  return ALL_SLOTS.map((slot) => ({
    slot,
    number: ANNEX_NUMBERS[slot],
    title: ANNEX_TITLES[slot],
    documents: documents.filter((document) => document.slot === slot),
  }));
}

/** The plan's documents in the order they are appended to the dossier. */
export function physicalAnnexDocuments(entries: AnnexEntry[]): AnnexDocument[] {
  return ANNEX_PHYSICAL_ORDER.flatMap((slot) => entries.find((entry) => entry.slot === slot)?.documents ?? []);
}

/**
 * The page each annex starts on, for the bordereau: the first page of its first readable
 * document when the documents are appended in physical order from `firstPage` on. An annex
 * with no readable document gets null (« — »). `pageCounts` gives each document's page count,
 * null when it cannot be read (it is then left out of the dossier).
 */
export function annexStartPages(
  entries: AnnexEntry[],
  pageCounts: Map<AnnexDocument, number | null>,
  firstPage: number,
): Map<AnnexSlot, number | null> {
  const pages = new Map<AnnexSlot, number | null>();
  let next = firstPage;
  for (const slot of ANNEX_PHYSICAL_ORDER) {
    const entry = entries.find((e) => e.slot === slot);
    let start: number | null = null;
    for (const document of entry?.documents ?? []) {
      const count = pageCounts.get(document) ?? null;
      if (count === null || count === 0) continue;
      start ??= next;
      next += count;
    }
    pages.set(slot, start);
  }
  return pages;
}

export interface AnnexCompanyFiles {
  anmeCertificateFileId: string | null;
}

export interface AnnexProjectFiles {
  cinFileId: string | null;
  commercialRegisterFileId: string | null;
  stegContractFileId: string | null;
  lastPaidBillFileId: string | null;
  moduleAcceptanceFileId: string | null;
  /** A flat's syndic (or co-owners') authorization; absent before the field existed. */
  syndicAuthorizationFileId?: string | null;
  extraFileIds: string[];
}

type EquipmentRef = (SnapshotEquipmentRef & Record<string, unknown>) | null | undefined;

function equipmentName(device: SnapshotEquipmentRef): string {
  return `${device.brand} ${device.model}`.trim();
}

/** A catalog item's datasheet then its homologation document, both in `slot`. */
function equipmentDocuments(slot: AnnexSlot, device: EquipmentRef): AnnexDocument[] {
  if (!device) return [];
  const documents: AnnexDocument[] = [];
  if (device.datasheetFileId) {
    documents.push({ slot, label: `Fiche technique ${equipmentName(device)}`, source: { kind: 'file', fileId: device.datasheetFileId } });
  }
  if (device.homologationFileId) {
    documents.push({ slot, label: `Homologation ${equipmentName(device)}`, source: { kind: 'file', fileId: device.homologationFileId } });
  }
  return documents;
}

function fileDocument(slot: AnnexSlot, label: string, fileId: string | null | undefined): AnnexDocument[] {
  return fileId ? [{ slot, label, source: { kind: 'file', fileId } }] : [];
}

/** A cable run's slot: from the catalog cable's usage, else from the run's circuit type. */
function cableSlot(run: WorkerJobSnapshot['cableRuns'][number]): AnnexSlot {
  const usage = run.cable?.usage;
  if (usage === 'EARTH') return 'EARTH_CABLE';
  if (usage === 'AC') return 'AC_CABLE';
  if (usage === 'DC_SOLAR') return 'DC_CABLE';
  return run.circuitType === 'AC' ? 'AC_CABLE' : 'DC_CABLE';
}

/**
 * Every stored file the dossier annexes, each in its slot: the administrative papers (the
 * installer's ANME agreement first), the structure attestation, then each piece of equipment's
 * datasheet and homologation document. The differential AC breaker goes under `RCD`. A file id
 * shared by two items (one cable datasheet for two runs) is listed once, under its first slot in
 * physical order. Rendered fragments (drawings, plans, PVGIS report) are added by the caller.
 */
export function annexDocumentsFromSnapshot(
  snapshot: WorkerJobSnapshot,
  company: AnnexCompanyFiles,
  annexes: AnnexProjectFiles | null,
  structureAttestationFileId: string | null,
): AnnexDocument[] {
  const documents: AnnexDocument[] = [
    ...fileDocument('ADMIN', "Agrément ANME de l'installateur", company.anmeCertificateFileId),
    ...fileDocument('ADMIN', 'Copie de la CIN du titulaire', annexes?.cinFileId),
    ...fileDocument('ADMIN', 'Registre de commerce', annexes?.commercialRegisterFileId),
    ...fileDocument('ADMIN', "Contrat STEG / attestation d'abonnement", annexes?.stegContractFileId),
    ...fileDocument('ADMIN', 'Autorisation du syndic ou des copropriétaires', annexes?.syndicAuthorizationFileId),
    ...fileDocument('ADMIN', 'Dernière facture STEG', annexes?.lastPaidBillFileId),
    ...(annexes?.extraFileIds ?? []).flatMap((fileId, i) => fileDocument('ADMIN', `Pièce complémentaire ${i + 1}`, fileId)),
    ...fileDocument('STRUCTURE', ANNEX_TITLES.STRUCTURE, structureAttestationFileId),
  ];

  const module = snapshot.arrayConfig?.module;
  if (module) {
    documents.push(...fileDocument('MODULE', `Fiche technique ${equipmentName(module)}`, module.datasheetFileId));
    documents.push(...fileDocument('MODULE', 'Acceptation ANME du module', annexes?.moduleAcceptanceFileId ?? module.homologationFileId));
  }
  for (const { inverter } of snapshot.arrayConfig?.inverters ?? []) {
    documents.push(...equipmentDocuments('INVERTER', inverter));
  }

  const protections = snapshot.protections;
  const acBreaker = protections?.acBreaker;
  const breakerIsDifferential = typeof acBreaker?.residualCurrentMA === 'number';
  documents.push(
    ...equipmentDocuments('DC_FUSE', protections?.dcFuse),
    ...equipmentDocuments('DC_SPD', protections?.dcSpd),
    ...equipmentDocuments('DC_SWITCH', protections?.dcSwitch),
    ...equipmentDocuments('AC_SPD', protections?.acSpd),
    ...equipmentDocuments('AC_ISOLATOR', protections?.acIsolator),
    ...equipmentDocuments(breakerIsDifferential ? 'RCD' : 'AC_MAIN_BREAKER', acBreaker),
  );

  for (const run of snapshot.cableRuns) {
    documents.push(...equipmentDocuments(cableSlot(run), run.cable));
  }
  documents.push(
    ...equipmentDocuments('EARTH_CABLE', snapshot.earthing?.earthCable),
    ...equipmentDocuments('CONNECTOR', snapshot.cablingConfig?.connector),
    ...equipmentDocuments('DISTRIBUTION_BLOCK', snapshot.earthing?.distributionBlock),
    ...equipmentDocuments('CABLE_TRAY', snapshot.cablingConfig?.cableTray),
  );

  // Stable sort into physical order, then keep each file id's first occurrence.
  const rank = (slot: AnnexSlot): number => ANNEX_PHYSICAL_ORDER.indexOf(slot);
  const ordered = documents.map((document, i) => ({ document, i })).sort((a, b) => rank(a.document.slot) - rank(b.document.slot) || a.i - b.i);
  const seen = new Set<string>();
  const unique: AnnexDocument[] = [];
  for (const { document } of ordered) {
    if (document.source.kind === 'file') {
      if (seen.has(document.source.fileId)) continue;
      seen.add(document.source.fileId);
    }
    unique.push(document);
  }
  return unique;
}
