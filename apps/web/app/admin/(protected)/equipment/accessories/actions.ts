'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireAuthenticatedSuperAdmin } from '../../layout';

export interface AccessoryActionState {
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

function parseFields(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ['brand', 'model', 'kind', 'spec', 'homologationReference', 'homologationValidTo']) {
    const value = formData.get(key);
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

export async function createAccessoryAction(
  _prevState: AccessoryActionState | undefined,
  formData: FormData,
): Promise<AccessoryActionState | undefined> {
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

  await db.accessory.create({
    data: {
      ownerCompanyId: null,
      brand: fields.brand!,
      model: fields.model!,
      kind: fields.kind as
        | 'MC4_CONNECTOR'
        | 'DISTRIBUTION_BLOCK'
        | 'CABLE_TRAY'
        | 'DC_ENCLOSURE'
        | 'AC_ENCLOSURE'
        | 'EARTH_ROD'
        | 'OTHER',
      spec: fields.spec ?? null,
      homologationReference: fields.homologationReference ?? null,
      homologationValidTo: fields.homologationValidTo ? new Date(fields.homologationValidTo) : null,
      ...(datasheetFileId ? { datasheetFileId } : {}),
      ...(homologationFileId ? { homologationFileId } : {}),
    },
  });

  redirect('/admin/equipment/accessories');
}

export async function updateAccessoryAction(
  accessoryId: string,
  _prevState: AccessoryActionState | undefined,
  formData: FormData,
): Promise<AccessoryActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.accessory.findUnique({ where: { id: accessoryId } });
  if (!existing) {
    return { error: 'Accessoire introuvable.' };
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

  await db.accessory.update({
    where: { id: accessoryId },
    data: {
      brand: fields.brand!,
      model: fields.model!,
      kind: fields.kind as
        | 'MC4_CONNECTOR'
        | 'DISTRIBUTION_BLOCK'
        | 'CABLE_TRAY'
        | 'DC_ENCLOSURE'
        | 'AC_ENCLOSURE'
        | 'EARTH_ROD'
        | 'OTHER',
      spec: fields.spec ?? null,
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

  redirect(`/admin/equipment/accessories/${accessoryId}`);
}

export async function deleteAccessoryAction(
  accessoryId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's calling convention
  _prevState: AccessoryActionState | undefined,
): Promise<AccessoryActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.accessory.findUnique({
    where: { id: accessoryId },
    include: { connectorFor: { take: 1 }, cableTrayFor: { take: 1 }, distributionBlockFor: { take: 1 } },
  });
  if (!existing) {
    return { error: 'Accessoire introuvable.' };
  }
  if (existing.connectorFor.length > 0 || existing.cableTrayFor.length > 0 || existing.distributionBlockFor.length > 0) {
    return { error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' };
  }

  await db.accessory.delete({ where: { id: accessoryId } });
  revalidatePath('/admin/equipment/accessories');

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
