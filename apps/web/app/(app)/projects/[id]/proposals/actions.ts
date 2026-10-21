'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireOwnedProject, ProjectNotFoundError } from '../../../../../lib/project-access';
import { PROJECT_ENGINE_INCLUDE } from '../../../../../lib/project-engine-input';
import { computeProjectProposals } from '../../../../../lib/project-proposals';
import { structureDataFor, EARTHING_FIXED_VALUES } from '../../../../../lib/section-defaults';

const NOT_FOUND = 'Projet introuvable.';
const PROPOSALS_CHANGED = 'Les propositions ont changé : rechargez la page.';
/** Earth resistance target used when the company has not set its own. */
const DEFAULT_EARTH_RESISTANCE_TARGET_OHM = 25;

/**
 * The installer picked a proposal with the client's approval: recompute the proposals (the
 * library or the client data may have changed since the page was shown), and if the chosen key is
 * still among them write every technical section in one transaction, then go to the map step.
 */
export async function applyProposalAction(projectId: string, proposalKey: string): Promise<{ error: string } | undefined> {
  let owned: Awaited<ReturnType<typeof requireOwnedProject>>;
  try {
    owned = await requireOwnedProject(projectId);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) return { error: NOT_FOUND };
    throw error;
  }

  const project = await db.project.findFirst({
    where: { id: owned.id, companyId: owned.companyId },
    include: PROJECT_ENGINE_INCLUDE,
  });
  if (!project) return { error: NOT_FOUND };

  const computed = await computeProjectProposals(project, new Date());
  if (!computed.ok && computed.blockedReasons.length > 0) return { error: computed.blockedReasons.join(' ') };
  const proposal = computed.ok ? computed.result.proposals.find((p) => p.key === proposalKey) : undefined;
  if (!computed.ok || !proposal) return { error: PROPOSALS_CHANGED };
  const { context } = computed;
  const { candidate } = proposal;

  const protections = {
    dcSpdId: candidate.dcSpdId,
    dcSwitchId: candidate.dcSwitchId,
    dcFuseId: candidate.dcFuseId,
    acBreakerId: candidate.acBreakerId,
    acSpdId: candidate.acSpdId,
    acIsolatorId: null,
  };
  const cablingConfig = {
    cosPhi: context.cosPhi,
    lambdaOhmPerM: context.lambdaOhmPerM,
    maxVoltageDropPct: context.maxVoltageDropPct,
  };
  const structure = structureDataFor('ALUMINIUM', context.windSpeedKmh);
  const earthing = {
    earthCableId: candidate.earthCableId,
    distributionBlockId: null,
    ...EARTHING_FIXED_VALUES,
    rodCount: 1,
    targetResistanceOhm: project.company.defaultEarthResistanceTargetOhm ?? DEFAULT_EARTH_RESISTANCE_TARGET_OHM,
  };
  // The figures and any PVsyst report described the replaced installation: PVGIS recomputes them.
  const simulation = {
    source: 'PVGIS_LIVE',
    pvsystReportFileId: null,
    annualProductionKWh: null,
    specificYieldKWhPerKWp: null,
    performanceRatioPct: null,
    systemLossesPct: null,
  };

  await db.$transaction(async (tx) => {
    const existingArray = await tx.projectArrayConfig.findUnique({ where: { projectId }, select: { id: true } });
    if (existingArray) {
      await tx.projectArrayMppt.deleteMany({ where: { arrayInverter: { arrayConfigId: existingArray.id } } });
      await tx.projectArrayInverter.deleteMany({ where: { arrayConfigId: existingArray.id } });
      await tx.projectArrayConfig.delete({ where: { id: existingArray.id } });
    }
    await tx.projectArrayConfig.create({
      data: {
        projectId,
        moduleId: candidate.module.id,
        tMinC: context.tMinC,
        tMaxC: context.tMaxC,
        rowsDescription: null,
        inverters: {
          create: [
            {
              inverterId: candidate.inverter.id,
              phaseConnection: null,
              mppts: {
                create: candidate.mppts.map((mppt) => ({
                  stringsInParallel: mppt.stringsInParallel,
                  modulesPerString: mppt.modulesPerString,
                })),
              },
            },
          ],
        },
      },
    });

    await tx.projectProtections.upsert({ where: { projectId }, create: { projectId, ...protections }, update: protections });
    await tx.projectCablingConfig.upsert({ where: { projectId }, create: { projectId, ...cablingConfig }, update: cablingConfig });

    await tx.projectCableRun.deleteMany({ where: { projectId } });
    await tx.projectCableRun.createMany({
      data: [
        {
          projectId,
          circuitType: 'DC',
          label: 'Champ PV → onduleur',
          cableId: candidate.dcCable.cableId,
          sectionMm2: candidate.dcCable.sectionMm2,
          lengthM: candidate.dcCable.lengthM,
          installMethod: '13',
          ambientContext: 'TRAY_SUN',
          groupedCircuits: 1,
          layers: 1,
        },
        {
          projectId,
          circuitType: 'AC',
          label: 'Onduleur → compteur STEG',
          cableId: candidate.acCable.cableId,
          sectionMm2: candidate.acCable.sectionMm2,
          lengthM: candidate.acCable.lengthM,
          installMethod: '3A',
          ambientContext: 'TECHNICAL_ROOM',
          groupedCircuits: 1,
          layers: 1,
        },
      ],
    });

    await tx.projectStructure.upsert({ where: { projectId }, create: { projectId, ...structure }, update: structure });
    await tx.projectEarthing.upsert({ where: { projectId }, create: { projectId, ...earthing }, update: earthing });
    await tx.projectSimulation.upsert({ where: { projectId }, create: { projectId, ...simulation }, update: simulation });
    await tx.project.update({ where: { id: projectId }, data: { flowStep: 'LOCATIONS' } });
  });

  redirect(`/projects/${projectId}/locations`);
}
