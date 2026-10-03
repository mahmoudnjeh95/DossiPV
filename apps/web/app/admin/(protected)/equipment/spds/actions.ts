'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireAuthenticatedSuperAdmin } from '../../layout';

export interface SpdActionState {
  error: string;
}

interface UploadSuccess {
  storageKey: string;
  mimeType: string;
  fileName: string;
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

const NUMERIC_FIELDS = ['type', 'poles', 'ucV', 'upKV', 'inKA', 'imaxKA', 'iscpvKA'] as const;

function parseFields(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ['brand', 'model', 'side', 'homologationReference', 'homologationValidTo', ...NUMERIC_FIELDS]) {
    const value = formData.get(key);
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

export async function createSpdAction(
  _prevState: SpdActionState | undefined,
  formData: FormData,
): Promise<SpdActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

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

  await db.spd.create({
    data: {
      ownerCompanyId: null,
      brand: fields.brand!,
      model: fields.model!,
      side: fields.side as 'DC' | 'AC',
      type: Number(fields.type),
      poles: Number(fields.poles),
      ucV: Number(fields.ucV),
      upKV: Number(fields.upKV),
      inKA: Number(fields.inKA),
      imaxKA: Number(fields.imaxKA),
      iscpvKA: fields.iscpvKA ? Number(fields.iscpvKA) : null,
      homologationReference: fields.homologationReference ?? null,
      homologationValidTo: fields.homologationValidTo ? new Date(fields.homologationValidTo) : null,
      ...(datasheetFileId ? { datasheetFileId } : {}),
      ...(homologationFileId ? { homologationFileId } : {}),
    },
  });

  redirect('/admin/equipment/spds');
}

export async function updateSpdAction(
  spdId: string,
  _prevState: SpdActionState | undefined,
  formData: FormData,
): Promise<SpdActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.spd.findUnique({ where: { id: spdId } });
  if (!existing) {
    return { error: 'Parafoudre introuvable.' };
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

  await db.spd.update({
    where: { id: spdId },
    data: {
      brand: fields.brand!,
      model: fields.model!,
      side: fields.side as 'DC' | 'AC',
      type: Number(fields.type),
      poles: Number(fields.poles),
      ucV: Number(fields.ucV),
      upKV: Number(fields.upKV),
      inKA: Number(fields.inKA),
      imaxKA: Number(fields.imaxKA),
      iscpvKA: fields.iscpvKA ? Number(fields.iscpvKA) : null,
      homologationReference: fields.homologationReference ?? null,
      homologationValidTo: fields.homologationValidTo ? new Date(fields.homologationValidTo) : null,
      ...(newDatasheetFileId ? { datasheetFileId: newDatasheetFileId } : {}),
    },
  });

  if (newDatasheetFileId && existing.datasheetFileId) {
    const oldFile = await db.file.findUnique({ where: { id: existing.datasheetFileId } });
    if (oldFile) {
      await deleteFile(oldFile.storageKey);
      await db.file.delete({ where: { id: oldFile.id } });
    }
  }

  redirect(`/admin/equipment/spds/${spdId}`);
}

export async function deleteSpdAction(
  spdId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's calling convention
  _prevState: SpdActionState | undefined,
): Promise<SpdActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.spd.findUnique({
    where: { id: spdId },
    include: { protectionsDc: { take: 1 }, protectionsAc: { take: 1 } },
  });
  if (!existing) {
    return { error: 'Parafoudre introuvable.' };
  }
  if (existing.protectionsDc.length > 0 || existing.protectionsAc.length > 0) {
    return { error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' };
  }

  await db.spd.delete({ where: { id: spdId } });
  revalidatePath('/admin/equipment/spds');

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
