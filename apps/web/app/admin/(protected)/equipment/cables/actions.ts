'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireAuthenticatedSuperAdmin } from '../../layout';

export interface CableActionState {
  error: string;
}

interface UploadSuccess {
  storageKey: string;
  mimeType: string;
  fileName: string;
}

interface SectionInput {
  sectionMm2: number;
  izA: number;
  izReferenceMethod: string;
}

async function uploadIfPresent(formData: FormData, fieldName: string): Promise<UploadSuccess | null | { error: string }> {
  const field = formData.get(fieldName);
  if (!(field instanceof File) || field.size === 0) {
    return null;
  }

  const buffer = Buffer.from(await field.arrayBuffer());
  const validation = validateUploadedFile(buffer, field.type, field.size);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const { storageKey } = await saveFile(buffer, field.name, field.type);
  return { storageKey, mimeType: validation.mimeType, fileName: field.name };
}

function parseFields(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ['brand', 'model', 'usage', 'conductor', 'insulation', 'standard', 'homologationReference', 'homologationValidTo']) {
    const value = formData.get(key);
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function parseSections(formData: FormData): SectionInput[] | { error: string } {
  const raw = formData.get('sections');
  if (typeof raw !== 'string') {
    return { error: 'Au moins une section de câble est requise.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Au moins une section de câble est requise.' };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: 'Au moins une section de câble est requise.' };
  }

  const sections: SectionInput[] = [];
  for (const entry of parsed) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).sectionMm2 !== 'number' ||
      typeof (entry as Record<string, unknown>).izA !== 'number' ||
      typeof (entry as Record<string, unknown>).izReferenceMethod !== 'string'
    ) {
      return { error: 'Au moins une section de câble est requise.' };
    }
    const typedEntry = entry as { sectionMm2: number; izA: number; izReferenceMethod: string };
    sections.push({ sectionMm2: typedEntry.sectionMm2, izA: typedEntry.izA, izReferenceMethod: typedEntry.izReferenceMethod });
  }

  return sections;
}

export async function createCableAction(
  _prevState: CableActionState | undefined,
  formData: FormData,
): Promise<CableActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const sectionsResult = parseSections(formData);
  if ('error' in sectionsResult) {
    return { error: sectionsResult.error };
  }

  const datasheetResult = await uploadIfPresent(formData, 'datasheet');
  if (datasheetResult && 'error' in datasheetResult) {
    return { error: datasheetResult.error };
  }
  const homologationResult = await uploadIfPresent(formData, 'homologationDocument');
  if (homologationResult && 'error' in homologationResult) {
    return { error: homologationResult.error };
  }

  const fields = parseFields(formData);

  let datasheetFileId: string | undefined;
  if (datasheetResult) {
    const file = await db.file.create({ data: { fileName: datasheetResult.fileName, mimeType: datasheetResult.mimeType, storageKey: datasheetResult.storageKey } });
    datasheetFileId = file.id;
  }
  let homologationFileId: string | undefined;
  if (homologationResult) {
    const file = await db.file.create({ data: { fileName: homologationResult.fileName, mimeType: homologationResult.mimeType, storageKey: homologationResult.storageKey } });
    homologationFileId = file.id;
  }

  await db.$transaction(async (tx) => {
    const cable = await tx.cable.create({
      data: {
        ownerCompanyId: null,
        brand: fields.brand!,
        model: fields.model!,
        usage: fields.usage as 'DC_SOLAR' | 'AC' | 'EARTH',
        conductor: fields.conductor!,
        insulation: fields.insulation!,
        standard: fields.standard ?? null,
        homologationReference: fields.homologationReference ?? null,
        homologationValidTo: fields.homologationValidTo ? new Date(fields.homologationValidTo) : null,
        ...(datasheetFileId ? { datasheetFileId } : {}),
        ...(homologationFileId ? { homologationFileId } : {}),
      },
    });

    await tx.cableSection.createMany({
      data: sectionsResult.map((section) => ({ cableId: cable.id, ...section })),
    });
  });

  redirect('/admin/equipment/cables');
}

export async function updateCableAction(
  cableId: string,
  _prevState: CableActionState | undefined,
  formData: FormData,
): Promise<CableActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.cable.findUnique({ where: { id: cableId } });
  if (!existing) {
    return { error: 'Câble introuvable.' };
  }

  const sectionsResult = parseSections(formData);
  if ('error' in sectionsResult) {
    return { error: sectionsResult.error };
  }

  const datasheetResult = await uploadIfPresent(formData, 'datasheet');
  if (datasheetResult && 'error' in datasheetResult) {
    return { error: datasheetResult.error };
  }

  const fields = parseFields(formData);

  let newDatasheetFileId: string | undefined;
  if (datasheetResult) {
    const file = await db.file.create({ data: { fileName: datasheetResult.fileName, mimeType: datasheetResult.mimeType, storageKey: datasheetResult.storageKey } });
    newDatasheetFileId = file.id;
  }

  await db.$transaction(async (tx) => {
    await tx.cable.update({
      where: { id: cableId },
      data: {
        brand: fields.brand!,
        model: fields.model!,
        usage: fields.usage as 'DC_SOLAR' | 'AC' | 'EARTH',
        conductor: fields.conductor!,
        insulation: fields.insulation!,
        standard: fields.standard ?? null,
        homologationReference: fields.homologationReference ?? null,
        homologationValidTo: fields.homologationValidTo ? new Date(fields.homologationValidTo) : null,
        ...(newDatasheetFileId ? { datasheetFileId: newDatasheetFileId } : {}),
      },
    });

    await tx.cableSection.deleteMany({ where: { cableId } });
    await tx.cableSection.createMany({
      data: sectionsResult.map((section) => ({ cableId, ...section })),
    });
  });

  if (newDatasheetFileId && existing.datasheetFileId) {
    const oldFile = await db.file.findUnique({ where: { id: existing.datasheetFileId } });
    if (oldFile) {
      await deleteFile(oldFile.storageKey);
      await db.file.delete({ where: { id: oldFile.id } });
    }
  }

  redirect(`/admin/equipment/cables/${cableId}`);
}

export async function deleteCableAction(
  cableId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's calling convention
  _prevState: CableActionState | undefined,
): Promise<CableActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.cable.findUnique({
    where: { id: cableId },
    include: { cableRuns: { take: 1 }, earthingCableFor: { take: 1 } },
  });
  if (!existing) {
    return { error: 'Câble introuvable.' };
  }
  if (existing.cableRuns.length > 0 || existing.earthingCableFor.length > 0) {
    return { error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' };
  }

  await db.$transaction(async (tx) => {
    await tx.cableSection.deleteMany({ where: { cableId } });
    await tx.cable.delete({ where: { id: cableId } });
  });
  revalidatePath('/admin/equipment/cables');

  if (existing.datasheetFileId) {
    const file = await db.file.findUnique({ where: { id: existing.datasheetFileId } });
    if (file) {
      await deleteFile(file.storageKey);
      await db.file.delete({ where: { id: file.id } });
    }
  }
  if (existing.homologationFileId) {
    const file = await db.file.findUnique({ where: { id: existing.homologationFileId } });
    if (file) {
      await deleteFile(file.storageKey);
      await db.file.delete({ where: { id: file.id } });
    }
  }

  return undefined;
}
