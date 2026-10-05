import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../../../layout';
import { catalogScope, isClientIdentityLocked } from '../../../../../../lib/project-access';
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

  const scope = catalogScope(user.companyId);
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
      const [modules, inverters] = await Promise.all([
        db.pvModule.findMany({ where: scope, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.inverter.findMany({ where: scope, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
      ]);
      body = (
        <ArrayForm
          projectId={project.id}
          companyId={user.companyId}
          defaults={{ tMinC: project.company.defaultTMinC, tMaxC: project.company.defaultTMaxC }}
          sitePhases={project.site?.phases ?? null}
          modules={modules.map((m) => ({
            id: m.id,
            label: `${m.brand} ${m.model} — ${m.pmaxW} Wc`,
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
            label: `${i.brand} ${i.model} — ${i.pacW / 1000} kW, ${i.phases === 3 ? 'tri' : 'mono'}`,
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
        db.spd.findMany({ where: scope, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.dcSwitch.findMany({ where: scope, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.dcFuse.findMany({ where: scope, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.acBreaker.findMany({ where: scope, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.acIsolator.findMany({ where: scope, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
      ]);
      body = (
        <ProtectionsForm
          projectId={project.id}
          protections={project.protections}
          catalog={{
            dcSpds: spds.filter((s) => s.side === 'DC').map((s) => ({ id: s.id, label: `${s.brand} ${s.model} — T${s.type}, Uc ${s.ucV} V`, isPrivate: s.ownerCompanyId !== null })),
            acSpds: spds.filter((s) => s.side === 'AC').map((s) => ({ id: s.id, label: `${s.brand} ${s.model} — T${s.type}, Uc ${s.ucV} V`, isPrivate: s.ownerCompanyId !== null })),
            dcSwitches: dcSwitches.map((s) => ({ id: s.id, label: `${s.brand} ${s.model} — ${s.ratedVoltageV} V / ${s.ratedCurrentA} A`, isPrivate: s.ownerCompanyId !== null })),
            dcFuses: dcFuses.map((f) => ({ id: f.id, label: `${f.brand} ${f.model} — ${f.ratedVoltageV} V / ${f.ratedCurrentA} A`, isPrivate: f.ownerCompanyId !== null })),
            acBreakers: acBreakers.map((b) => ({ id: b.id, label: `${b.brand} ${b.model} — ${b.ratedCurrentA} A${b.curve ? ` courbe ${b.curve}` : ''}`, isPrivate: b.ownerCompanyId !== null })),
            acIsolators: acIsolators.map((i) => ({ id: i.id, label: `${i.brand} ${i.model} — ${i.ratedCurrentA} A`, isPrivate: i.ownerCompanyId !== null })),
          }}
        />
      );
      break;
    }
    case 'cabling': {
      const [cables, accessories] = await Promise.all([
        db.cable.findMany({ where: { ...scope, usage: { in: ['DC_SOLAR', 'AC'] } }, include: { sections: true }, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
        db.accessory.findMany({ where: { ...scope, kind: { in: ['MC4_CONNECTOR', 'CABLE_TRAY'] } }, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
      ]);
      body = (
        <CablingForm
          projectId={project.id}
          defaults={{ cosPhi: project.company.defaultCosPhi, maxVoltageDropPct: project.company.defaultMaxVoltageDropPct }}
          cables={cables.map((c) => ({
            id: c.id,
            label: `${c.brand} ${c.model} — ${c.conductor} / ${c.insulation}`,
            isPrivate: c.ownerCompanyId !== null,
            usage: c.usage === 'DC_SOLAR' ? 'DC' : 'AC',
            sections: c.sections.map((s) => s.sectionMm2).sort((a, b) => a - b),
          }))}
          connectors={accessories.filter((a) => a.kind === 'MC4_CONNECTOR').map((a) => ({ id: a.id, label: `${a.brand} ${a.model}`, isPrivate: a.ownerCompanyId !== null }))}
          cableTrays={accessories.filter((a) => a.kind === 'CABLE_TRAY').map((a) => ({ id: a.id, label: `${a.brand} ${a.model}`, isPrivate: a.ownerCompanyId !== null }))}
          initial={
            project.cablingConfig
              ? {
                  cosPhi: project.cablingConfig.cosPhi,
                  lambdaOhmPerM: project.cablingConfig.lambdaOhmPerM,
                  maxVoltageDropPct: project.cablingConfig.maxVoltageDropPct,
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
      const cables = await db.cable.findMany({ where: { ...scope, usage: 'EARTH' }, orderBy: [{ brand: 'asc' }, { model: 'asc' }] });
      body = (
        <EarthingForm
          projectId={project.id}
          earthing={project.earthing}
          defaults={{ targetResistanceOhm: project.company.defaultEarthResistanceTargetOhm }}
          earthCables={cables.map((c) => ({ id: c.id, label: `${c.brand} ${c.model} — ${c.conductor} / ${c.insulation}`, isPrivate: c.ownerCompanyId !== null }))}        />
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
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> › <Link href={projectHref}>{project.client?.fullName ?? 'Projet'}</Link> › {title}
      </p>
      <h1>{title}</h1>
      {body}
    </main>
  );
}
