/**
 * One calculation note in the reference dossier's layout: the formula, its « Application
 * numérique » with the project's own numbers, the result and, when the note checks a rule, its
 * conclusion (printed red and underlined). All pre-formatted French text (decimal comma); a
 * multi-line value uses `\n` (the template fills with `linebreaks: true`).
 */
export interface CalculationNote {
  title: string;
  formula: string;
  application: string;
  result: string;
  /** Null when the note only computes a value and checks no rule. */
  conclusion: string | null;
}

/** A protection sizing note: the requirements, their numbers, and the device fitted. */
export interface ProtectionNote extends CalculationNote {
  /** `brand model — ratings` of the device fitted. */
  chosen: string;
}

/**
 * The current-carrying capacity note of one cable run (DC, then AC): Iz' = Iz × K1 × K2 × K3 × K4
 * with each NF C 15-100 factor, against the run's design current. Pre-formatted French text.
 */
export interface CableSizingRow {
  /** `Liaison DC (label)`. */
  link: string;
  /** The install method named in French with its code, e.g. `Chemin de câbles perforé (mode de pose 13)`. */
  installMethodText: string;
  sectionMm2: string;
  /** Reference current-carrying capacity of the cable (A). */
  iz: string;
  k1: string;
  k2: string;
  k3: string;
  k4: string;
  /** Iz' (A), the engine's `*_RUN_IZ_CORRECTED`. */
  izCorrected: string;
  /** DC: 1,25 × Isc × Np; AC: Ib = Σ Iac max (A). */
  designCurrent: string;
  /** One line per factor, with the install conditions it comes from (`\n`-separated). */
  factorsText: string;
  /** `Iz' = 56 × 1 × 1 × 0,82 × 1 = 45,92 A`. */
  application: string;
  result: string;
  conclusion: string;
}

/** The voltage drop note of one cable run: the engine formula, its inputs and the run's own limit. */
export interface VoltageDropRow {
  link: string;
  /** The formula, then its legend (`\n`-separated). */
  formula: string;
  /** Resistivity (Ω·mm²/m). */
  rho: string;
  lengthM: string;
  currentA: string;
  sectionMm2: string;
  /** The reference voltage: the string Vmp (DC) or Un (AC), in V. */
  voltageV: string;
  dropV: string;
  dropPct: string;
  /** This run's own limit (%): DC 3, AC 1 by default. */
  limitPct: string;
  /** Two lines: ΔU in V, then in %. */
  application: string;
  result: string;
  conclusion: string;
}

export interface DossierTemplateData {
  /** True when STEG pieces are missing: the title is followed by the draft notice. */
  isDraft: boolean;
  /** The missing pieces, `a ; b ; c`; empty when the dossier is complete. */
  draftMissingText: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  clientFullName: string;
  clientAddress: string;
  clientStegReference: string;
  /** The installer's own dossier number (e.g. `434 - 303`). */
  dossierNumber: string;
  /** The dossier date, `dd/MM/yyyy`. */
  dossierDateText: string;
  /** `Installateur agréé ANME n° … (catégorie …), agrément valable jusqu'au dd/MM/yyyy`. */
  installerAnmeLine: string;
  /** `Matricule fiscal : …`, or `… non renseigné`. */
  installerTaxIdLine: string;
  /** `Représentant légal : name, role` — also signs the dossier. */
  installerLegalRepLine: string;
  /** `CIN : …`, or a pointer to the CIN copy in annex N°1. */
  clientCinLine: string;
  introduction: string;
  solution: string;
  cabling: string;
  earthing: string;
  /** `Bâtiment : maison individuelle, toiture au niveau R+1`; empty when the building type is unknown. */
  siteBuildingLine: string;
  /** Rows of the earthing table. */
  earthingDetails: { label: string; value: string }[];
  structure: string;
  // Not `conclusion`: docxtemplater resolves a null tag inside a loop from the enclosing scope, so
  // a calculation note's null `conclusion` would print the dossier's conclusion section.
  conclusionText: string;
  moduleBrandModel: string;
  inverterBrandModel: string;
  pDcW: string;
  moduleCount: string;
  // Flat fields, not nested objects — docxtemplater 3.71.0 (the installed version) does not
  // resolve dotted-path tags like {moduleSpecs.pmaxW} against nested render data (confirmed
  // empirically before writing this plan); every new tag must be a flat top-level key, same
  // as the existing pDcW/moduleCount fields.
  moduleSpecPmaxW: string;
  moduleSpecVmpV: string;
  moduleSpecImpA: string;
  moduleSpecVocV: string;
  moduleSpecIscA: string;
  inverterSpecVdcMaxV: string;
  inverterSpecMpptMinV: string;
  inverterSpecMpptMaxV: string;
  /** `Tmin = -10 °C, Tmax = 85 °C (hypothèses de calcul)`, printed above the string sizing notes. */
  temperatureAssumptions: string;
  /** The string sizing calculation notes (Voc(Tmin) … Fusible DC), in dossier order. */
  stringSizingNotes: CalculationNote[];
  /** The protection sizing notes (DC switch, DC SPD, differential breaker, AC SPD, AC disconnection). */
  protectionNotes: ProtectionNote[];
  /** The current-carrying capacity notes, DC run then AC run (Task 21). */
  cableSizingRows: CableSizingRow[];
  /** The voltage drop notes, DC run then AC run, each with its own limit (Task 21). */
  voltageDropRows: VoltageDropRow[];
  /** `La chute de tension est calculée pour chaque tronçon ; limites : DC 3 %, AC 1 % (UTE C15-712-1).` */
  voltageDropLimitsText: string;
  // The stability table is only rendered when stabilityComputed is true (the project supplied
  // the wind-stability inputs); otherwise the three strings below are empty and unused.
  stabilityComputed: boolean;
  stabilityWeightN: string;
  stabilityLhs: string;
  stabilityRhs: string;
  // Computed in code (build-template-data.ts), never hardcoded as literal template text — the
  // VII/VIII sections are each only present when their own template condition is true, and a
  // hardcoded "IX" would otherwise skip straight from "VI" in the common case where both are
  // absent. Each already includes the trailing ".", e.g. "VI.".
  sectionNumberPreambule: string;
  sectionNumberPresentation: string;
  sectionNumberDimensionnement: string;
  sectionNumberSolution: string;
  sectionNumberProtections: string;
  sectionNumberCablage: string;
  sectionNumberTerre: string;
  sectionNumberStructure: string;
  sectionNumberFusible: string;
  sectionNumberSectionneur: string;
  sectionNumberConclusion: string;
  // "Dimensionnement et productible" section: all pre-formatted French strings (decimal comma).
  sizingBranchement: string;
  sizingSubscribedPower: string;
  sizingConsumption: string;
  sizingInstalledKWp: string;
  sizingInverterPac: string;
  sizingDcAcRatio: string;
  sizingRule: string;
  productionAnnual: string;
  productionSpecificYield: string;
  productionPr: string;
  productionCoverage: string;
  productionMethod: string;
  productionMonths: { monthLabel: string; globInc: string; eGrid: string; pr: string }[];
  productionTotalGlobInc: string;
  productionTotalEGrid: string;
  inverters: {
    inverterLabel: string;
    // Each inverter's own brand/model (not projectMeta.inverterBrandModel, which is only the
    // first inverter's — a mixed-model array must show the right model on every row).
    inverterBrandModel: string;
    pacW: string;
    mppts: { mpptLabel: string; stringsInParallel: number; modulesPerString: number }[];
  }[];
  /** Every cable run: numbers formatted fr-FR, the install method named (not a bare code). */
  cableRuns: { label: string; sectionMm2: string; lengthM: string; installMethod: string }[];
  dcFuseRequired: boolean;
  acIsolatorRequired: boolean;
}
