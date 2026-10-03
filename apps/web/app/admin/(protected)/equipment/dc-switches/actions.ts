'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireAuthenticatedSuperAdmin } from '../../layout';

export interface DcSwitchActionState {
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

const NUMERIC_FIELDS = ['ratedVoltageV', 'ratedCurrentA', 'poles'] as const;

function parseFields(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ['brand', 'model', 'homologationReference', 'homologationValidTo', ...NUMERIC_FIELDS]) {
    const value = formData.get(key);
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

export async function createDcSwitchAction(
  _prevState: DcSwitchActionState | undefined,
  formData: FormData,
): Promise<DcSwitchActionState | undefined> {
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

  await db.dcSwitch.create({
    data: {
      ownerCompanyId: null,
      brand: fields.brand!,
      model: fields.model!,
      ratedVoltageV: Number(fields.ratedVoltageV),
      ratedCurrentA: Number(fields.ratedCurrentA),
      poles: Number(fields.poles),
      homologationReference: fields.homologationReference ?? null,
      homologationValidTo: fields.homologationValidTo ? new Date(fields.homologationValidTo) : null,
      ...(datasheetFileId ? { datasheetFileId } : {}),
      ...(homologationFileId ? { homologationFileId } : {}),
    },
  });

  redirect('/admin/equipment/dc-switches');
}

export async function updateDcSwitchAction(
  dcSwitchId: string,
  _prevState: DcSwitchActionState | undefined,
  formData: FormData,
): Promise<DcSwitchActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.dcSwitch.findUnique({ where: { id: dcSwitchId } });
  if (!existing) {
    return { error: 'Sectionneur DC introuvable.' };
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

  await db.dcSwitch.update({
    where: { id: dcSwitchId },
    data: {
      brand: fields.brand!,
      model: fields.model!,
      ratedVoltageV: Number(fields.ratedVoltageV),
      ratedCurrentA: Number(fields.ratedCurrentA),
      poles: Number(fields.poles),
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

  redirect(`/admin/equipment/dc-switches/${dcSwitchId}`);
}

export async function deleteDcSwitchAction(
  dcSwitchId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's calling convention
  _prevState: DcSwitchActionState | undefined,
): Promise<DcSwitchActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.dcSwitch.findUnique({
    where: { id: dcSwitchId },
    include: { protections: { take: 1 } },
  });
  if (!existing) {
    return { error: 'Sectionneur DC introuvable.' };
  }
  if (existing.protections.length > 0) {
    return { error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' };
  }

  await db.dcSwitch.delete({ where: { id: dcSwitchId } });
  revalidatePath('/admin/equipment/dc-switches');

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
