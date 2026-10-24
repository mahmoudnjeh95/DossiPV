import { db } from '@dossipv/db';
import { checkC24 } from '@dossipv/engine';
import type {
  CatalogCable,
  CatalogInverter,
  CatalogModule,
  ConductorType,
  InsulationType,
  ReferenceMethod,
  SizingCatalog,
} from '@dossipv/engine';
import { catalogScope, libraryScope, provenanceScope } from './project-access';
import { toIsoDate, toRcdType } from './project-engine-input';

const CONDUCTORS: readonly string[] = ['Cu', 'Al'] satisfies ConductorType[];
const INSULATIONS: readonly string[] = ['PR', 'PVC', 'EPR', 'XLPO'] satisfies InsulationType[];
const REFERENCE_METHODS: readonly string[] = ['B', 'C', 'E', 'F'] satisfies ReferenceMethod[];

function isConductor(value: string): value is ConductorType {
  return CONDUCTORS.includes(value);
}

function isInsulation(value: string): value is InsulationType {
  return INSULATIONS.includes(value);
}

function isReferenceMethod(value: string): value is ReferenceMethod {
  return REFERENCE_METHODS.includes(value);
}

function isoOrNull(date: Date | null): string | null {
  return date ? toIsoDate(date) : null;
}

type ModuleRow = Awaited<ReturnType<typeof db.pvModule.findMany>>[number];
type InverterRow = Awaited<ReturnType<typeof db.inverter.findMany>>[number];

function toCatalogModule(row: ModuleRow): CatalogModule {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    homologationValidTo: isoOrNull(row.homologationValidTo),
    pmaxW: row.pmaxW,
    vmpV: row.vmpV,
    impA: row.impA,
    vocV: row.vocV,
    iscA: row.iscA,
    tempCoeffVocPct: row.tempCoeffVocPct,
    tempCoeffIscPct: row.tempCoeffIscPct,
    tempCoeffPmaxPct: row.tempCoeffPmaxPct,
    ...(row.tempCoeffVmpPct !== null ? { tempCoeffVmpPct: row.tempCoeffVmpPct } : {}),
    irmA: row.irmA,
    maxSystemVoltageV: row.maxSystemVoltageV,
    bifacial: row.bifacial,
    ...(row.bifacialGainPct !== null ? { bifacialGainPct: row.bifacialGainPct } : {}),
    lengthMm: row.lengthMm,
    widthMm: row.widthMm,
    weightKg: row.weightKg,
    ...(row.noctC !== null ? { noctC: row.noctC } : {}),
  };
}

/** A phase count other than 1 or 3 is one the engine cannot read: no inverter. */
function toCatalogInverters(row: InverterRow): CatalogInverter[] {
  if (row.phases !== 1 && row.phases !== 3) return [];
  return [
    {
      id: row.id,
      brand: row.brand,
      model: row.model,
      homologationValidTo: isoOrNull(row.homologationValidTo),
      phases: row.phases,
      pacW: row.pacW,
      sacVA: row.sacVA,
      vdcMaxV: row.vdcMaxV,
      mpptMinV: row.mpptMinV,
      mpptMaxV: row.mpptMaxV,
      startUpV: row.startUpV,
      mpptCount: row.mpptCount,
      inputsPerMppt: row.inputsPerMppt,
      idcMaxPerMpptA: row.idcMaxPerMpptA,
      iscMaxPerMpptA: row.iscMaxPerMpptA,
      vacNomV: row.vacNomV,
      iacMaxA: row.iacMaxA,
      stegApproved: row.stegApproved,
    },
  ];
}

/**
 * The highlighted panels and inverters the sponsored sizing pass uses, whether or not they are in
 * the company's library: a shared item must be published and sourced, like in `loadSizingCatalog`,
 * and the engine must be able to read it. Ordered by id so the same set always yields the same proposals.
 */
export async function loadHighlightedSizingItems(
  moduleIds: string[],
  inverterIds: string[],
): Promise<Pick<SizingCatalog, 'modules' | 'inverters'>> {
  const shared = { ownerCompanyId: null, catalogStatus: 'PUBLISHED' as const, datasheetSourceUrl: { not: null } };
  const orderBy = { id: 'asc' as const };
  const [modules, inverters] = await Promise.all([
    moduleIds.length > 0 ? db.pvModule.findMany({ where: { id: { in: moduleIds }, ...shared }, orderBy }) : [],
    inverterIds.length > 0 ? db.inverter.findMany({ where: { id: { in: inverterIds }, ...shared }, orderBy }) : [],
  ]);
  return { modules: modules.map(toCatalogModule), inverters: inverters.flatMap(toCatalogInverters) };
}

/**
 * The equipment the sizing may propose: only the company's library, and never a shared draft.
 * Rows are ordered by id so the same library always yields the same proposals (the proposal the
 * installer clicks is recomputed and matched by key). Rows the engine cannot read (a phase count
 * other than 1 or 3, an unknown conductor, insulation or reference method) are left out.
 */
export async function loadSizingCatalog(companyId: string): Promise<SizingCatalog> {
  const query = { where: { AND: [libraryScope(companyId), catalogScope(companyId), provenanceScope(companyId)] }, orderBy: { id: 'asc' as const } };
  const [modules, inverters, dcSwitches, dcFuses, spds, acBreakers, cables] = await Promise.all([
    db.pvModule.findMany(query),
    db.inverter.findMany(query),
    db.dcSwitch.findMany(query),
    db.dcFuse.findMany(query),
    db.spd.findMany(query),
    db.acBreaker.findMany(query),
    db.cable.findMany({ ...query, include: { sections: true } }),
  ]);

  return {
    modules: modules.map(toCatalogModule),
    inverters: inverters.flatMap(toCatalogInverters),
    dcSwitches: dcSwitches.map((row) => ({
      id: row.id,
      brand: row.brand,
      model: row.model,
      ratedVoltageV: row.ratedVoltageV,
      ratedCurrentA: row.ratedCurrentA,
    })),
    dcFuses: dcFuses.map((row) => ({
      id: row.id,
      brand: row.brand,
      model: row.model,
      ratedCurrentA: row.ratedCurrentA,
      ratedVoltageV: row.ratedVoltageV,
    })),
    spds: spds.map((row) => ({
      id: row.id,
      brand: row.brand,
      model: row.model,
      side: row.side,
      type: row.type,
      ucV: row.ucV,
      upKV: row.upKV,
      inKA: row.inKA,
      iscpvKA: row.iscpvKA,
    })),
    acBreakers: acBreakers.map((row) => ({
      id: row.id,
      brand: row.brand,
      model: row.model,
      ratedCurrentA: row.ratedCurrentA,
      residualCurrentMA: row.residualCurrentMA,
      rcdType: toRcdType(row.rcdType),
    })),
    cables: cables.flatMap((row): CatalogCable[] => {
      const { conductor, insulation } = row;
      if (!isConductor(conductor) || !isInsulation(insulation)) return [];
      return [
        {
          id: row.id,
          brand: row.brand,
          model: row.model,
          usage: row.usage,
          conductor,
          insulation,
          sections: row.sections.flatMap((section) => {
            const method = section.izReferenceMethod;
            return isReferenceMethod(method)
              ? [{ sectionMm2: section.sectionMm2, izA: section.izA, izReferenceMethod: method }]
              : [];
          }),
        },
      ];
    }),
  };
}

/**
 * What the library still lacks before a single-phase installation can be proposed, as French
 * labels in a fixed order. Empty means every kind of equipment is present (the sizing may still
 * find no valid combination).
 */
export function missingLibraryKinds(catalog: SizingCatalog): string[] {
  const hasCable = (usage: CatalogCable['usage']): boolean => catalog.cables.some((cable) => cable.usage === usage);
  const requirements: [string, boolean][] = [
    ['Modules photovoltaïques', catalog.modules.length > 0],
    [
      'Onduleurs monophasés homologués STEG',
      catalog.inverters.some((inverter) => inverter.phases === 1 && inverter.stegApproved === true),
    ],
    ['Interrupteurs-sectionneurs DC', catalog.dcSwitches.length > 0],
    ['Parafoudres DC', catalog.spds.some((spd) => spd.side === 'DC')],
    ['Parafoudres AC', catalog.spds.some((spd) => spd.side === 'AC')],
    // The 30 mA protection is the AC breaker itself: a plain or type AC breaker does not count.
    ['Disjoncteurs différentiels AC 30 mA (type A)', catalog.acBreakers.some((breaker) => checkC24(breaker).pass)],
    ['Câbles DC (solaire)', hasCable('DC_SOLAR')],
    ['Câbles AC', hasCable('AC')],
    ['Câbles de terre', hasCable('EARTH')],
  ];
  return requirements.flatMap(([label, present]) => (present ? [] : [label]));
}
