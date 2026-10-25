import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../../../layout';
import { equipmentChoiceScope, isClientIdentityLocked } from '../../../../../../lib/project-access';
import { acBreakerRating } from '../../../../../../lib/labels';
import { highlightedFirst, loadHighlightedProducts } from '../../../../../../lib/highlight';
import { SPONSORED_OPTION_PREFIX } from '../../../../../../components/sponsored-badge';
import { isSponsored } from '../../../../../../lib/sponsorship';
import { ClientForm } from '../forms/client-form';
import { SiteForm } from '../forms/site-form';
import { ProtectionsForm } from '../forms/protections-form';
import { StructureForm } from '../forms/structure-form';
import { EarthingForm } from '../forms/earthing-form';
import { SimulationForm } from '../forms/simulation-form';
import { ArrayForm } from '../forms/array-form';
import { CablingForm } from '../forms/cabling-form';
import { AnnexesForm } from '../forms/annexes-form';

const SECTION_TITLES: Record<string, string> = {
  client: 'Client',
  site: 'Site',
  array: 'Champ PV',
  protections: 'Protections',
  cabling: 'Câblage',
  structure: 'Structure',
  earthing: 'Mise à la terre',
  simulation: 'Simulation de production',
  annexes: 'Annexes',
};

export default async function SectionPage({ params }: { params: Promise<{ id: string; section: string }> }): Promise<React.JSX.Element> {
  const { id, section } = await params;
  const title = SECTION_TITLES[section];
  if (!title) {
    notFound();
  }

  const user = await requireAuthenticatedCompanyUser();
  const project = await db.project.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      company: true,
      client: true,
      site: true,
      arrayConfig: { include: { inverters: { include: { mppts: true } } } },
      protections: true,
      cablingConfig: true,
      cableRuns: true,
      structure: true,
      earthing: true,
      simulation: true,
      annexes: { include: { extraFiles: true } },
    },
  });
  if (!project) {
    notFound();
  }

  // Each dropdown offers the company library plus what this project already uses.
  const companyId = user.companyId;
  const choiceScope = (...ids: (string | null | undefined)[]): ReturnType<typeof equipmentChoiceScope> =>
    equipmentChoiceScope(companyId, ids.filter((id): id is string => typeof id === 'string'));
  const inLibrary = { libraryItems: { where: { companyId }, select: { id: true } } } as const;
  const OUT_OF_LIBRARY = ' (hors bibliothèque)';
  const tag = (label: string, item: { libraryItems: unknown[] }): string => (item.libraryItems.length > 0 ? label : `${label}${OUT_OF_LIBRARY}`);
  const projectHref = `/projects/${project.id}`;

  let body: React.JSX.Element;
  switch (section) {
    case 'client': {
      const locked = await isClientIdentityLocked(project.id);
      body = <ClientForm projectId={project.id} client={project.client} locked={locked} />;
      break;
    }
    case 'site':
      body = <SiteForm projectId={project.id} site={project.site} />;
      break;
    case 'array': {
      const [foundModules, foundInverters, highlighted] = await Promise.all([
        db.pvModule.findMany({ where: choiceScope(project.arrayConfig?.moduleId), include: inLibrary, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.inverter.findMany({ where: choiceScope(...(project.arrayConfig?.inverters.map((i) => i.inverterId) ?? [])), include: inLibrary, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        // Highlighted products of the library come first, for direct installers only (spec §6.1).
        (await isSponsored(companyId)) ? null : loadHighlightedProducts(),
      ]);
      const inLib = (item: { libraryItems: unknown[] }): boolean => item.libraryItems.length > 0;
      const sponsoredIds = (ids: string[] | undefined, items: { id: string; libraryItems: unknown[] }[]): string[] =>
        (ids ?? []).filter((id) => items.some((item) => item.id === id && inLib(item)));
      const moduleIds = sponsoredIds(highlighted?.moduleIds, foundModules);
      const inverterIds = sponsoredIds(highlighted?.inverterIds, foundInverters);
      const modules = highlightedFirst(foundModules, moduleIds);
      const inverters = highlightedFirst(foundInverters, inverterIds);
      const star = (ids: string[], id: string, label: string): string => (ids.includes(id) ? `${SPONSORED_OPTION_PREFIX}${label}` : label);
      body = (
        <ArrayForm
          projectId={project.id}
          companyId={user.companyId}
          defaults={{ tMinC: project.company.defaultTMinC, tMaxC: project.company.defaultTMaxC }}
          sitePhases={project.site?.phases ?? null}
          modules={modules.map((m) => ({
            id: m.id,
            label: star(moduleIds, m.id, tag(`${m.brand} ${m.model} — ${m.pmaxW} Wc`, m)),
            isPrivate: m.ownerCompanyId !== null,
            spec: {
              pmaxW: m.pmaxW, vmpV: m.vmpV, impA: m.impA, vocV: m.vocV, iscA: m.iscA,
              tempCoeffVocPct: m.tempCoeffVocPct, tempCoeffIscPct: m.tempCoeffIscPct, tempCoeffPmaxPct: m.tempCoeffPmaxPct,
              ...(m.tempCoeffVmpPct !== null ? { tempCoeffVmpPct: m.tempCoeffVmpPct } : {}),
              irmA: m.irmA, maxSystemVoltageV: m.maxSystemVoltageV, lengthMm: m.lengthMm, widthMm: m.widthMm, weightKg: m.weightKg,
            },
          }))}
          inverters={inverters.map((i) => ({
            id: i.id,
            label: star(inverterIds, i.id, tag(`${i.brand} ${i.model} — ${i.pacW / 1000} kW, ${i.phases === 3 ? 'tri' : 'mono'}`, i)),
            isPrivate: i.ownerCompanyId !== null,
            spec: {
              phases: i.phases === 3 ? 3 : 1,
              pacW: i.pacW, sacVA: i.sacVA, vdcMaxV: i.vdcMaxV, mpptMinV: i.mpptMinV, mpptMaxV: i.mpptMaxV, startUpV: i.startUpV,
              mpptCount: i.mpptCount, inputsPerMppt: i.inputsPerMppt, idcMaxPerMpptA: i.idcMaxPerMpptA, iscMaxPerMpptA: i.iscMaxPerMpptA,
              vacNomV: i.vacNomV, iacMaxA: i.iacMaxA, stegApproved: i.stegApproved,
            },
          }))}
          initial={
            project.arrayConfig
              ? {
                  moduleId: project.arrayConfig.moduleId,
                  tMinC: project.arrayConfig.tMinC,
                  tMaxC: project.arrayConfig.tMaxC,
                  rowsDescription: project.arrayConfig.rowsDescription,
                  inverters: project.arrayConfig.inverters.map((inv) => ({
                    inverterId: inv.inverterId,
                    phaseConnection: inv.phaseConnection,
                    mppts: inv.mppts.map((m) => ({ stringsInParallel: m.stringsInParallel, modulesPerString: m.modulesPerString })),
                  })),
                }
              : null
          }
        />
      );
      break;
    }
    case 'protections': {
      const [spds, dcSwitches, dcFuses, acBreakers, acIsolators] = await Promise.all([
        db.spd.findMany({ where: choiceScope(project.protections?.dcSpdId, project.protections?.acSpdId), include: inLibrary, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.dcSwitch.findMany({ where: choiceScope(project.protections?.dcSwitchId), include: inLibrary, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.dcFuse.findMany({ where: choiceScope(project.protections?.dcFuseId), include: inLibrary, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.acBreaker.findMany({ where: choiceScope(project.protections?.acBreakerId), include: inLibrary, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.acIsolator.findMany({ where: choiceScope(project.protections?.acIsolatorId), include: inLibrary, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
      ]);
      body = (
        <ProtectionsForm
          projectId={project.id}
          protections={project.protections}
          catalog={{
            dcSpds: spds.filter((s) => s.side === 'DC').map((s) => ({ id: s.id, label: tag(`${s.brand} ${s.model} — T${s.type}, Uc ${s.ucV} V`, s), isPrivate: s.ownerCompanyId !== null })),
            acSpds: spds.filter((s) => s.side === 'AC').map((s) => ({ id: s.id, label: tag(`${s.brand} ${s.model} — T${s.type}, Uc ${s.ucV} V`, s), isPrivate: s.ownerCompanyId !== null })),
            dcSwitches: dcSwitches.map((s) => ({ id: s.id, label: tag(`${s.brand} ${s.model} — ${s.ratedVoltageV} V / ${s.ratedCurrentA} A`, s), isPrivate: s.ownerCompanyId !== null })),
            dcFuses: dcFuses.map((f) => ({ id: f.id, label: tag(`${f.brand} ${f.model} — ${f.ratedVoltageV} V / ${f.ratedCurrentA} A`, f), isPrivate: f.ownerCompanyId !== null })),
            acBreakers: acBreakers.map((b) => ({ id: b.id, label: tag(`${b.brand} ${b.model} — ${acBreakerRating(b)}${b.curve ? ` courbe ${b.curve}` : ''}`, b), isPrivate: b.ownerCompanyId !== null })),
            acIsolators: acIsolators.map((i) => ({ id: i.id, label: tag(`${i.brand} ${i.model} — ${i.ratedCurrentA} A`, i), isPrivate: i.ownerCompanyId !== null })),
          }}
        />
      );
      break;
    }
    case 'cabling': {
      const [cables, accessories] = await Promise.all([
        db.cable.findMany({ where: { ...choiceScope(...project.cableRuns.map((r) => r.cableId)), usage: { in: ['DC_SOLAR', 'AC'] } }, include: { sections: true, ...inLibrary }, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.accessory.findMany({ where: { ...choiceScope(project.cablingConfig?.connectorId, project.cablingConfig?.cableTrayId), kind: { in: ['MC4_CONNECTOR', 'CABLE_TRAY'] } }, include: inLibrary, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
      ]);
      body = (
        <CablingForm
          projectId={project.id}
          defaults={{ cosPhi: project.company.defaultCosPhi, maxVoltageDropPct: project.company.defaultMaxVoltageDropPct, maxAcVoltageDropPct: project.company.defaultMaxAcVoltageDropPct }}
          cables={cables.map((c) => ({
            id: c.id,
            label: tag(`${c.brand} ${c.model} — ${c.conductor} / ${c.insulation}`, c),
            isPrivate: c.ownerCompanyId !== null,
            usage: c.usage === 'DC_SOLAR' ? 'DC' : 'AC',
            sections: c.sections.map((s) => s.sectionMm2).sort((a, b) => a - b),
          }))}
          connectors={accessories.filter((a) => a.kind === 'MC4_CONNECTOR').map((a) => ({ id: a.id, label: tag(`${a.brand} ${a.model}`, a), isPrivate: a.ownerCompanyId !== null }))}
          cableTrays={accessories.filter((a) => a.kind === 'CABLE_TRAY').map((a) => ({ id: a.id, label: tag(`${a.brand} ${a.model}`, a), isPrivate: a.ownerCompanyId !== null }))}
          initial={
            project.cablingConfig
              ? {
                  cosPhi: project.cablingConfig.cosPhi,
                  lambdaOhmPerM: project.cablingConfig.lambdaOhmPerM,
                  maxVoltageDropPct: project.cablingConfig.maxVoltageDropPct,
                  maxAcVoltageDropPct: project.cablingConfig.maxAcVoltageDropPct,
                  connectorId: project.cablingConfig.connectorId,
                  cableTrayId: project.cablingConfig.cableTrayId,
                  runs: project.cableRuns.map((r) => ({
                    circuitType: r.circuitType,
                    label: r.label,
                    cableId: r.cableId,
                    sectionMm2: r.sectionMm2,
                    lengthM: r.lengthM,
                    installMethod: r.installMethod,
                    ambientContext: r.ambientContext,
                    groupedCircuits: r.groupedCircuits,
                    layers: r.layers,
                  })),
                }
              : null
          }
        />
      );
      break;
    }
    case 'structure':
      body = (
        <StructureForm
          projectId={project.id}
          structure={project.structure}
          defaults={{ windSpeedKmh: project.company.defaultDesignWindSpeedKmh }}
        />
      );
      break;
    case 'earthing': {
      const cables = await db.cable.findMany({ where: { ...choiceScope(project.earthing?.earthCableId), usage: 'EARTH' }, include: inLibrary, orderBy: [{ brand: 'asc' }, { model: 'asc' }] });
      body = (
        <EarthingForm
          projectId={project.id}
          earthing={project.earthing}
          defaults={{ targetResistanceOhm: project.company.defaultEarthResistanceTargetOhm }}
          earthCables={cables.map((c) => ({ id: c.id, label: tag(`${c.brand} ${c.model} — ${c.conductor} / ${c.insulation}`, c), isPrivate: c.ownerCompanyId !== null }))}
        />
      );
      break;
    }
    case 'simulation':
      body = <SimulationForm projectId={project.id} simulation={project.simulation} />;
      break;
    case 'annexes':
      body = (
        <AnnexesForm
          projectId={project.id}
          annexes={{
            hasCin: project.annexes?.cinFileId != null,
            hasCommercialRegister: project.annexes?.commercialRegisterFileId != null,
            hasStegContract: project.annexes?.stegContractFileId != null,
            hasLastPaidBill: project.annexes?.lastPaidBillFileId != null,
            hasModuleAcceptance: project.annexes?.moduleAcceptanceFileId != null,
            extraFileCount: project.annexes?.extraFiles.length ?? 0,
          }}
        />
      );
      break;
    default:
      notFound();
  }

  return (
    <main>
      <p className="mb-2 text-[0.9rem] [&_a]:no-underline">
        <Link href="/projects">Projets</Link> › <Link href={projectHref}>{project.client?.fullName ?? 'Projet'}</Link> › {title}
      </p>
      <h1>{title}</h1>
      {body}
    </main>
  );
}
