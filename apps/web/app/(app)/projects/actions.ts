'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { deleteFile } from '@dossipv/file-storage';
import { requireInstallerUser } from '../layout';
import { FormReader } from '../../../lib/form-reader';
import { CIVILITY_OPTIONS, CLIENT_KIND_OPTIONS } from '../../../lib/labels';
import { newProjectSettings } from '../../../lib/subscription';

export interface CreateProjectActionState {
  error: string;
}

/**
 * Creates a DRAFT project for the caller's company. The tier comes from the company's current
 * plan (spec §1: Premium unlocks the map-based pages 37–38), never from the form, so a client
 * cannot grant itself Premium by editing a hidden field.
 */
export async function createProjectAction(
  _prevState: CreateProjectActionState | undefined,
  formData: FormData,
): Promise<CreateProjectActionState | undefined> {
  const user = await requireInstallerUser();

  const reader = new FormReader(formData);
  const fullName = reader.text('fullName', 'Nom du client', 200);
  const civility = reader.optionalOneOf(
    'civility',
    'Civilité',
    CIVILITY_OPTIONS.map((o) => o.value),
  );
  const clientKind = reader.oneOf(
    'clientKind',
    'Type de client',
    CLIENT_KIND_OPTIONS.map((o) => o.value),
  );
  const stegReference = reader.optionalText('stegReference', 'Référence STEG', 100);

  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  const { tier, with3d } = await newProjectSettings(user.companyId, new Date());

  const project = await db.project.create({
    data: {
      companyId: user.companyId,
      tier,
      with3d,
      status: 'DRAFT',
      client: { create: { fullName, civility, clientKind, stegReference } },
    },
  });

  redirect(`/projects/${project.id}`);
  return undefined;
}

export interface ProjectListActionState {
  error: string;
}

const NOT_FOUND = 'Projet introuvable.';
const DELETE_REFUSED = 'Un dossier a déjà été lancé pour ce projet : archivez-le plutôt.';

/** Archives a project, or brings it back to the list: nothing else about it changes. */
export async function setProjectArchivedAction(
  projectId: string,
  archived: boolean,
): Promise<ProjectListActionState | undefined> {
  const user = await requireInstallerUser();
  const { count } = await db.project.updateMany({
    where: { id: projectId, companyId: user.companyId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) return { error: NOT_FOUND };
  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return undefined;
}

/**
 * Deletes a project that never had a dossier launched, with its client, sections and annexes. A
 * project with any job stays: its jobs count in the quota and carry the dossier number and costs.
 */
export async function deleteProjectAction(projectId: string): Promise<ProjectListActionState | undefined> {
  const user = await requireInstallerUser();

  const fileIds = await db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
      select: {
        id: true,
        _count: { select: { jobs: true } },
        site: { select: { siteImageFileId: true } },
        structure: { select: { structureAttestationFileId: true } },
        simulation: { select: { pvsystReportFileId: true } },
        imagery: { select: { situationImageFileId: true, implantationImageFileId: true } },
        billImport: { select: { fileId: true } },
        annexes: {
          select: {
            cinFileId: true,
            commercialRegisterFileId: true,
            stegContractFileId: true,
            lastPaidBillFileId: true,
            moduleAcceptanceFileId: true,
            syndicAuthorizationFileId: true,
            extraFiles: { select: { fileId: true } },
          },
        },
      },
    });
    if (!project) return { error: NOT_FOUND };
    if (project._count.jobs > 0) return { error: DELETE_REFUSED };

    const { extraFiles, ...annexFileIds } = project.annexes ?? { extraFiles: [] };
    const ids = [
      project.site?.siteImageFileId,
      project.structure?.structureAttestationFileId,
      project.simulation?.pvsystReportFileId,
      project.imagery?.situationImageFileId,
      project.imagery?.implantationImageFileId,
      project.billImport?.fileId,
      ...Object.values(annexFileIds),
      ...extraFiles.map((extra) => extra.fileId),
    ];

    const where = { projectId };
    await tx.projectArrayMppt.deleteMany({ where: { arrayInverter: { arrayConfig: where } } });
    await tx.projectArrayInverter.deleteMany({ where: { arrayConfig: where } });
    await tx.projectArrayConfig.deleteMany({ where });
    await tx.projectProtections.deleteMany({ where });
    await tx.projectCableRun.deleteMany({ where });
    await tx.projectCablingConfig.deleteMany({ where });
    await tx.projectStructure.deleteMany({ where });
    await tx.projectEarthing.deleteMany({ where });
    await tx.projectSimulation.deleteMany({ where });
    await tx.projectImagery.deleteMany({ where });
    await tx.projectOffGrid.deleteMany({ where });
    await tx.projectAnnexExtraFile.deleteMany({ where: { annexes: where } });
    await tx.projectAnnexes.deleteMany({ where });
    await tx.projectBillImport.deleteMany({ where });
    await tx.projectClient.deleteMany({ where });
    await tx.projectSite.deleteMany({ where });
    await tx.project.delete({ where: { id: projectId } });
    return [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  });
  if (!Array.isArray(fileIds)) return fileIds;

  // The project is gone: its files follow. A file still linked elsewhere keeps its row and bytes.
  for (const id of fileIds) {
    try {
      const file = await db.file.delete({ where: { id } });
      await deleteFile(file.storageKey);
    } catch {
      // Left for a later cleanup: the project itself is already deleted.
    }
  }

  revalidatePath('/projects');
  return undefined;
}
