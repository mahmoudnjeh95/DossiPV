'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireAuthenticatedSuperAdmin } from '../../layout';

export interface PvModuleActionState {
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
  'pmaxW', 'vmpV', 'impA', 'vocV', 'iscA', 'tempCoeffVocPct', 'tempCoeffIscPct',
  'tempCoeffPmaxPct', 'tempCoeffVmpPct', 'irmA', 'maxSystemVoltageV', 'bifacialGainPct',
  'lengthMm', 'widthMm', 'weightKg', 'noctC',
] as const;

function parseFields(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ['brand', 'model', ...NUMERIC_FIELDS]) {
    const value = formData.get(key);
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

export async function createPvModuleAction(
  _prevState: PvModuleActionState | undefined,
  formData: FormData,
): Promise<PvModuleActionState | undefined> {
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
  const bifacial = formData.get('bifacial') === 'on';

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

  await db.pvModule.create({
    data: {
      ownerCompanyId: null,
      brand: fields.brand!,
      model: fields.model!,
      pmaxW: Number(fields.pmaxW),
      vmpV: Number(fields.vmpV),
      impA: Number(fields.impA),
      vocV: Number(fields.vocV),
      iscA: Number(fields.iscA),
      tempCoeffVocPct: Number(fields.tempCoeffVocPct),
      tempCoeffIscPct: Number(fields.tempCoeffIscPct),
      tempCoeffPmaxPct: Number(fields.tempCoeffPmaxPct),
      tempCoeffVmpPct: fields.tempCoeffVmpPct ? Number(fields.tempCoeffVmpPct) : null,
      irmA: Number(fields.irmA),
      maxSystemVoltageV: Number(fields.maxSystemVoltageV),
      bifacial,
      bifacialGainPct: fields.bifacialGainPct ? Number(fields.bifacialGainPct) : null,
      lengthMm: Number(fields.lengthMm),
      widthMm: Number(fields.widthMm),
      weightKg: Number(fields.weightKg),
      noctC: fields.noctC ? Number(fields.noctC) : null,
      ...(datasheetFileId ? { datasheetFileId } : {}),
      ...(homologationFileId ? { homologationFileId } : {}),
    },
  });

  redirect('/admin/equipment/pv-modules');
}

export async function updatePvModuleAction(
  moduleId: string,
  _prevState: PvModuleActionState | undefined,
  formData: FormData,
): Promise<PvModuleActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.pvModule.findUnique({ where: { id: moduleId } });
  if (!existing) {
    return { error: 'Module introuvable.' };
  }

  const datasheetResult = await uploadIfPresent(formData, 'datasheet');
  if (datasheetResult && 'error' in datasheetResult) {
    return { error: datasheetResult.error };
  }

  const fields = parseFields(formData);
  const bifacial = formData.get('bifacial') === 'on';

  let newDatasheetFileId: string | undefined;
  if (datasheetResult) {
    const file = await db.file.create({ data: { fileName: datasheetResult.fileName, mimeType: datasheetResult.mimeType, storageKey: datasheetResult.storageKey } });
    newDatasheetFileId = file.id;
  }

  await db.pvModule.update({
    where: { id: moduleId },
    data: {
      brand: fields.brand!,
      model: fields.model!,
      pmaxW: Number(fields.pmaxW),
      vmpV: Number(fields.vmpV),
      impA: Number(fields.impA),
      vocV: Number(fields.vocV),
      iscA: Number(fields.iscA),
      tempCoeffVocPct: Number(fields.tempCoeffVocPct),
      tempCoeffIscPct: Number(fields.tempCoeffIscPct),
      tempCoeffPmaxPct: Number(fields.tempCoeffPmaxPct),
      tempCoeffVmpPct: fields.tempCoeffVmpPct ? Number(fields.tempCoeffVmpPct) : null,
      irmA: Number(fields.irmA),
      maxSystemVoltageV: Number(fields.maxSystemVoltageV),
      bifacial,
      bifacialGainPct: fields.bifacialGainPct ? Number(fields.bifacialGainPct) : null,
      lengthMm: Number(fields.lengthMm),
      widthMm: Number(fields.widthMm),
      weightKg: Number(fields.weightKg),
      noctC: fields.noctC ? Number(fields.noctC) : null,
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

  redirect(`/admin/equipment/pv-modules/${moduleId}`);
}

export async function deletePvModuleAction(
  moduleId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's calling convention
  _prevState: PvModuleActionState | undefined,
): Promise<PvModuleActionState | undefined> {
  await requireAuthenticatedSuperAdmin();

  const existing = await db.pvModule.findUnique({
    where: { id: moduleId },
    include: { arrayConfigs: { take: 1 } },
  });
  if (!existing) {
    return { error: 'Module introuvable.' };
  }
  if (existing.arrayConfigs.length > 0) {
    return { error: 'Cet équipement est utilisé par au moins un projet et ne peut pas être supprimé.' };
  }

  await db.pvModule.delete({ where: { id: moduleId } });

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
