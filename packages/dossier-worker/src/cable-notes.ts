import { INSTALL_METHOD_LABELS, RHO_AL, RHO_CU, type CableRunInput, type EngineResult, type RunEngineInput } from '@dossipv/engine';
import type { CableSizingRow, VoltageDropRow } from '@dossipv/docx-template';
import { conformity, fr, fr2 } from './calculation-notes';

/**
 * The cable notes of the dossier (Task 21): the current-carrying capacity Iz' = Iz × K1 × K2 × K3 ×
 * K4 of each run (cabling.ts izCorrectionFactors / izCorrected) and its voltage drop (duDcV/duDcPct,
 * duAcV/duAcPct). Every factor, current and drop printed is the engine's derived value; only the
 * inputs come from the engine input.
 */

/** The install method named in French with its code (STEG remark 10: never a bare code). */
export function installMethodText(code: string): string {
  return INSTALL_METHOD_LABELS[code] ?? `Mode de pose ${code}`;
}

/** A computed voltage, 3 decimals (the drops are a few volts). */
function fr3(value: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);
}

/** A physical constant as tabled (ρ = 0,02314, λ = 0,00008): never rounded. */
function frExact(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 8 }).format(value);
}

export interface CableNotesInput {
  engineInput: RunEngineInput;
  engineResult: EngineResult;
  /** The snapshot's cable runs: the first DC and the first AC run name the links (the engine's dcRun/acRun). */
  cableRuns: { label: string; circuitType?: string }[];
}

type Side = 'DC' | 'AC';

function linkName(side: Side, cableRuns: CableNotesInput['cableRuns']): string {
  const run = cableRuns.find((candidate) => candidate.circuitType === side);
  return run ? `Liaison ${side} (${run.label})` : `Liaison ${side}`;
}

function resistivity(run: CableRunInput): number {
  return run.conductor === 'Al' ? RHO_AL : RHO_CU;
}

/** The engine's derived factors of one run. */
function factorsOf(side: Side, derived: Record<string, number>): { iz: number; k1: number; k2: number; k3: number; k4: number; ambientC: number; izCorrected: number } {
  return {
    iz: derived[`${side}_RUN_IZ`]!,
    k1: derived[`${side}_RUN_K1`]!,
    k2: derived[`${side}_RUN_K2`]!,
    k3: derived[`${side}_RUN_K3`]!,
    k4: derived[`${side}_RUN_K4`]!,
    ambientC: derived[`${side}_RUN_AMBIENT_C`]!,
    izCorrected: derived[`${side}_RUN_IZ_CORRECTED`]!,
  };
}

/** One line per factor with the install condition it comes from (NF C 15-100 tables cited in the template). */
function factorsText(run: CableRunInput, factors: ReturnType<typeof factorsOf>): string {
  // PR, EPR and XLPO share the PR column of the K3 table (schema note on Cable.insulation).
  const insulation = run.insulation === 'EPR' || run.insulation === 'XLPO' ? `${run.insulation} (colonne PR)` : run.insulation;
  const grouping = run.groupedCircuits > 1 ? `${fr(run.groupedCircuits)} circuits jointifs (méthode de référence ${run.referenceMethod})` : 'un seul circuit';
  return [
    `Mode de pose : ${installMethodText(run.installMethod)} → K1 = ${fr(factors.k1)}`,
    `Groupement : ${grouping} → K2 = ${fr(factors.k2)}`,
    `Température ambiante : ${fr(factors.ambientC)} °C, isolant ${insulation} → K3 = ${fr(factors.k3)}`,
    `Pose en ${fr(run.layers)} ${run.layers > 1 ? 'couches' : 'couche'} → K4 = ${fr(factors.k4)}`,
    `Iz du câble de ${fr(run.sectionMm2)} mm² (méthode de référence ${run.referenceMethod}, 30 °C) = ${fr(factors.iz)} A`,
  ].join('\n');
}

function sizingRow(side: Side, run: CableRunInput, link: string, derived: Record<string, number>): Omit<CableSizingRow, 'designCurrent' | 'conclusion'> {
  const factors = factorsOf(side, derived);
  return {
    link,
    installMethodText: installMethodText(run.installMethod),
    sectionMm2: fr(run.sectionMm2),
    iz: fr(factors.iz),
    k1: fr(factors.k1),
    k2: fr(factors.k2),
    k3: fr(factors.k3),
    k4: fr(factors.k4),
    izCorrected: fr2(factors.izCorrected),
    factorsText: factorsText(run, factors),
    application: `Iz' = ${fr(factors.iz)} × ${fr(factors.k1)} × ${fr(factors.k2)} × ${fr(factors.k3)} × ${fr(factors.k4)} = ${fr2(factors.izCorrected)} A`,
    result: `Iz' = ${fr2(factors.izCorrected)} A`,
  };
}

/**
 * The DC run (check C16: Iz' ≥ ISC_FIELD_DESIGN, UTE C15-712-1) and the AC run (check C13:
 * Ib = Iac max ≤ In ≤ Iz', NF C 15-100), in that order.
 */
export function buildCableSizingRows({ engineInput, engineResult, cableRuns }: CableNotesInput): CableSizingRow[] {
  const d = engineResult.derived;
  const bifacial = (engineInput.module.bifacialGainPct ?? 0) !== 0 ? ' × (1 + Gbif/100)' : '';

  const dc = sizingRow('DC', engineInput.dcRun, linkName('DC', cableRuns), d);
  const dcDesign = d.ISC_FIELD_DESIGN!;
  const dcCheck = conformity(engineResult.checks, ['C16']);
  const dcConclusion = dcCheck.pass
    ? `Iz' = ${fr2(d.DC_RUN_IZ_CORRECTED!)} A ≥ courant de conception 1,25 × Isc × Np${bifacial} = ${fr2(dcDesign)} A : condition vérifiée, la section de ${dc.sectionMm2} mm² est retenue.`
    : `Condition Iz' ≥ courant de conception non vérifiée : ${dcCheck.failures.join(' ; ')}.`;

  const ac = sizingRow('AC', engineInput.acRun, linkName('AC', cableRuns), d);
  const acDesign = d.AC_DESIGN_CURRENT!;
  const acCheck = conformity(engineResult.checks, ['C13']);
  const acConclusion = acCheck.pass
    ? `Ib = ${fr(acDesign)} A ≤ In = ${fr(engineInput.acBreaker.ratedCurrentA)} A ≤ Iz' = ${fr2(d.AC_RUN_IZ_CORRECTED!)} A : condition vérifiée, la section de ${ac.sectionMm2} mm² est retenue.`
    : `Condition Ib ≤ In ≤ Iz' non vérifiée : ${acCheck.failures.join(' ; ')}.`;

  return [
    { ...dc, designCurrent: fr2(dcDesign), conclusion: dcConclusion },
    { ...ac, designCurrent: fr(acDesign), conclusion: acConclusion },
  ];
}

const DC_DROP_FORMULA = [
  'ΔU = 2 × ρ × L / S × Imp × Np ; ΔU (%) = 100 × ΔU / (Ns × Vmp)',
  'ρ : résistivité du conducteur (Ω·mm²/m) ; L : longueur simple du tronçon (m) ; S : section (mm²) ; Imp : courant du module au point de puissance maximale (A) ; Np : chaînes en parallèle ; Ns × Vmp : tension de la chaîne au point de puissance maximale (V)',
].join('\n');

const AC_DROP_FORMULA = [
  'ΔU = b × (ρ × L / S × cos φ + λ × L × sin φ) × Iac max ; ΔU (%) = 100 × ΔU / Un',
  "b = 2 en monophasé (√3 en triphasé) ; ρ : résistivité du conducteur (Ω·mm²/m) ; L : longueur simple du tronçon (m) ; S : section (mm²) ; λ : réactance linéique du câble (Ω/m) ; cos φ : facteur de puissance ; Iac max : courant AC maximal de l'onduleur (A) ; Un : tension nominale, 230 V en monophasé (400 V en triphasé)",
].join('\n');

/** ΔU ≤ limit: the same comparison as check C17 for this run. */
function dropConclusion(pct: number, limitPct: number): string {
  return pct <= limitPct
    ? `ΔU = ${fr2(pct)} % ≤ ${fr(limitPct)} % : la chute de tension est admissible.`
    : `ΔU = ${fr2(pct)} % > ${fr(limitPct)} % : la chute de tension n'est pas admissible.`;
}

/** The DC limit and the AC limit the engine checks (C17); the AC one falls back to the DC one on a legacy input. */
function dropLimits(engineInput: RunEngineInput): { dc: number; ac: number } {
  return { dc: engineInput.maxVoltageDropPct, ac: engineInput.maxAcVoltageDropPct ?? engineInput.maxVoltageDropPct };
}

export function buildVoltageDropLimitsText(engineInput: RunEngineInput): string {
  const limits = dropLimits(engineInput);
  return `La chute de tension est calculée pour chaque tronçon ; limites : DC ${fr(limits.dc)} %, AC ${fr(limits.ac)} % (UTE C15-712-1).`;
}

/**
 * The DC run (duDcV with the representative MPPT's Np, duDcPct over STRING_VMP_STC) and the AC run
 * (duAcV with the first inverter's Iac max, duAcPct over 230 V or 400 V), each against its own limit.
 */
export function buildVoltageDropRows({ engineInput, engineResult, cableRuns }: CableNotesInput): VoltageDropRow[] {
  const d = engineResult.derived;
  const limits = dropLimits(engineInput);
  const { module } = engineInput;
  // The engine's representative string (run-engine.ts: array[0].mppts[0]).
  const mppt = engineInput.array[0]!.mppts[0]!;
  const dcRun = engineInput.dcRun;
  const dcV = d.DU_DC_V!;
  const dcPct = d.DU_DC_PCT!;
  const dc: VoltageDropRow = {
    link: linkName('DC', cableRuns),
    formula: DC_DROP_FORMULA,
    rho: frExact(resistivity(dcRun)),
    lengthM: fr(dcRun.lengthM),
    currentA: fr(module.impA * mppt.stringsInParallel),
    sectionMm2: fr(dcRun.sectionMm2),
    voltageV: fr(d.STRING_VMP_STC!),
    dropV: fr3(dcV),
    dropPct: fr2(dcPct),
    limitPct: fr(limits.dc),
    application: [
      `ΔU = 2 × ${frExact(resistivity(dcRun))} × ${fr(dcRun.lengthM)} / ${fr(dcRun.sectionMm2)} × ${fr(module.impA)} × ${fr(mppt.stringsInParallel)} = ${fr3(dcV)} V`,
      `ΔU (%) = 100 × ${fr3(dcV)} / (${fr(mppt.modulesPerString)} × ${fr(module.vmpV)}) = ${fr2(dcPct)} %`,
    ].join('\n'),
    result: `ΔU = ${fr3(dcV)} V, soit ${fr2(dcPct)} %`,
    conclusion: dropConclusion(dcPct, limits.dc),
  };

  const acRun = engineInput.acRun;
  const phases = engineInput.site.phases;
  const b = phases === 1 ? 2 : Math.sqrt(3);
  const un = phases === 1 ? 230 : 400;
  const sinPhi = Math.sqrt(1 - engineInput.cosPhi * engineInput.cosPhi);
  const iacMaxA = engineInput.array[0]!.inverter.iacMaxA;
  const acV = d.DU_AC_V!;
  const acPct = d.DU_AC_PCT!;
  const rhoAc = frExact(resistivity(acRun));
  const ac: VoltageDropRow = {
    link: linkName('AC', cableRuns),
    formula: AC_DROP_FORMULA,
    rho: rhoAc,
    lengthM: fr(acRun.lengthM),
    currentA: fr(iacMaxA),
    sectionMm2: fr(acRun.sectionMm2),
    voltageV: fr(un),
    dropV: fr3(acV),
    dropPct: fr2(acPct),
    limitPct: fr(limits.ac),
    application: [
      `ΔU = ${fr(b)} × (${rhoAc} × ${fr(acRun.lengthM)} / ${fr(acRun.sectionMm2)} × ${fr(engineInput.cosPhi)} + ${frExact(engineInput.lambdaOhmPerM)} × ${fr(acRun.lengthM)} × ${fr(sinPhi)}) × ${fr(iacMaxA)} = ${fr3(acV)} V`,
      `ΔU (%) = 100 × ${fr3(acV)} / ${fr(un)} = ${fr2(acPct)} %`,
    ].join('\n'),
    result: `ΔU = ${fr3(acV)} V, soit ${fr2(acPct)} %`,
    conclusion: dropConclusion(acPct, limits.ac),
  };
  return [dc, ac];
}
