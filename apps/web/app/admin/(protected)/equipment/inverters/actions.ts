'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireAuthenticatedSuperAdmin } from '../../layout';

export interface InverterActionState {
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

const NUMERIC_FIELDS = [
  'phases', 'pacW', 'sacVA', 'vdcMaxV', 'mpptMinV', 'mpptMaxV', 'startUpV', 'mpptCount',
  'inputsPerMppt', 'idcMaxPerMpptA', 'iscMaxPerMpptA', 'vacNomV', 'iacMaxA',
] as const;

function parseFields(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ['brand', 'model', 'vacRangeV', ...NUMERIC_FIELDS]) {
    const value = formData.get(key);
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

export async function createInverterAction(
  _prevState: InverterActionState | undefined,
  formData: FormData,
): Promise<InverterActionState | undefined> {
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
  const integratedDcSwitch = formData.get('integratedDcSwitch') === 'on';
  const stegApproved = formData.get('stegApproved') === 'on';

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

  await db.inverter.create({
    data: {
      ownerCompanyId: null,
      brand: fields.brand!,
      model: fields.model!,
      phases: Number(fields.phases) as 1 | 3,
      pacW: Number(fields.pacW),
      sacVA: Number(fields.sacVA),
      vdcMaxV: Number(fields.vdcMaxV),
      mpptMinV: Number(fields.mpptMinV),
      mpptMaxV: Number(fields.mpptMaxV),
      startUpV: Number(fields.startUpV),
      mpptCount: Number(fields.mpptCount),
      inputsPerMppt: Number(fields.inputsPerMppt),
      idcMaxPerMpptA: Number(fields.idcMaxPerMpptA),
      iscMaxPerMpptA: Number(fields.iscMaxPerMpptA),
      vacNomV: Number(fields.vacNomV),
      vacRangeV: fields.vacRangeV ?? null,
      iacMaxA: Number(fields.iacMaxA),
      integratedDcSwitch,
      stegApproved,
      ...(datasheetFileId ? { datasheetFileId } : {}),
      ...(homologationFileId ? { homologationFileId } : {}),
    },
  });

  redirect('/admin/equipment/inverters');
}

export async function updateInverterAction(
  inverterId: string,
  _prevState: InverterActionState | undefined,
  formData: FormData,
): Promise<InverterActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.inverter.findUnique({ where: { id: inverterId } });
  if (!existing) {
    return { error: 'Onduleur introuvable.' };
  }

  const datasheetResult = await uploadIfPresent(formData, 'datasheet');
  if (datasheetResult && 'error' in datasheetResult) {
    return { error: datasheetResult.error };
  }

  const fields = parseFields(formData);
  const integratedDcSwitch = formData.get('integratedDcSwitch') === 'on';
  const stegApproved = formData.get('stegApproved') === 'on';

  let newDatasheetFileId: string | undefined;
  if (datasheetResult) {
    const file = await db.file.create({ data: { fileName: datasheetResult.fileName, mimeType: datasheetResult.mimeType, storageKey: datasheetResult.storageKey } });
    newDatasheetFileId = file.id;
  }

  await db.inverter.update({
    where: { id: inverterId },
    data: {
      brand: fields.brand!,
      model: fields.model!,
      phases: Number(fields.phases) as 1 | 3,
      pacW: Number(fields.pacW),
      sacVA: Number(fields.sacVA),
      vdcMaxV: Number(fields.vdcMaxV),
      mpptMinV: Number(fields.mpptMinV),
      mpptMaxV: Number(fields.mpptMaxV),
      startUpV: Number(fields.startUpV),
      mpptCount: Number(fields.mpptCount),
      inputsPerMppt: Number(fields.inputsPerMppt),
      idcMaxPerMpptA: Number(fields.idcMaxPerMpptA),
      iscMaxPerMpptA: Number(fields.iscMaxPerMpptA),
      vacNomV: Number(fields.vacNomV),
      vacRangeV: fields.vacRangeV ?? null,
      iacMaxA: Number(fields.iacMaxA),
      integratedDcSwitch,
      stegApproved,
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

  redirect(`/admin/equipment/inverters/${inverterId}`);
}

export async function deleteInverterAction(
  inverterId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's calling convention
  _prevState: InverterActionState | undefined,
): Promise<InverterActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.inverter.findUnique({
    where: { id: inverterId },
    include: { arrayInverters: { take: 1 } },
  });
  if (!existing) {
    return { error: 'Onduleur introuvable.' };
  }
  if (existing.arrayInverters.length > 0) {
    return { error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' };
  }

  await db.inverter.delete({ where: { id: inverterId } });

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
