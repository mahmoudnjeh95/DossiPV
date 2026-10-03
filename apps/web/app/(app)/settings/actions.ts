'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import { requireAuthenticatedCompanyUser } from '../layout';
import { FormReader } from '../../../lib/form-reader';

export interface SaveCompanyActionState {
  error: string;
}

const ANME_CATEGORIES = ['BT', 'MT', 'BT_MT'] as const;

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

/**
 * Updates the caller's own company record. Everything here ends up printed on every page of a
 * dossier (spec §5 "Branding"), so the installer owns it; the login email and password stay with
 * the super-admin (spec §8).
 */
export async function saveCompanyAction(
  _prev: SaveCompanyActionState | undefined,
  formData: FormData,
): Promise<SaveCompanyActionState | undefined> {
  const user = await requireAuthenticatedCompanyUser();

  const existing = await db.company.findUnique({ where: { id: user.companyId }, select: { logoFileId: true, anmeCertificateFileId: true } });
  if (!existing) {
    return { error: 'Société introuvable.' };
  }

  const logoResult = await uploadIfPresent(formData, 'logo');
  if (logoResult && 'error' in logoResult) {
    return { error: logoResult.error };
  }
  const anmeCertificateResult = await uploadIfPresent(formData, 'anmeCertificate');
  if (anmeCertificateResult && 'error' in anmeCertificateResult) {
    return { error: anmeCertificateResult.error };
  }

  const reader = new FormReader(formData);
  const anmeValidFromRaw = reader.text('anmeValidFrom', 'Début de validité ANME', 10);
  const anmeValidToRaw = reader.text('anmeValidTo', 'Fin de validité ANME', 10);
  const data = {
    name: reader.text('name', 'Raison sociale', 200),
    shortName: reader.optionalText('shortName', 'Nom court', 50),
    slogan: reader.optionalText('slogan', 'Slogan', 200),
    address: reader.text('address', 'Adresse', 300),
    phone: reader.text('phone', 'Téléphone', 30),
    email: reader.text('email', 'Email de contact', 200),
    taxId: reader.optionalText('taxId', 'Matricule fiscal', 50),
    commercialRegister: reader.optionalText('commercialRegister', 'Registre de commerce', 50),
    legalRepFullName: reader.text('legalRepFullName', 'Représentant légal', 200),
    legalRepRole: reader.text('legalRepRole', 'Fonction du représentant', 100),
    anmeCode: reader.text('anmeCode', 'Code ANME', 50),
    anmeReference: reader.optionalText('anmeReference', 'Référence ANME', 100),
    anmeCategory: reader.oneOf('anmeCategory', 'Catégorie ANME', ANME_CATEGORIES),
    defaultTMinC: reader.number('defaultTMinC', 'Tmin par défaut', { min: -50, max: 50 }),
    defaultTMaxC: reader.number('defaultTMaxC', 'Tmax par défaut', { min: 0, max: 120 }),
    defaultMaxVoltageDropPct: reader.number('defaultMaxVoltageDropPct', 'Chute de tension max par défaut', { min: 0, max: 20 }),
    defaultEarthResistanceTargetOhm: reader.optionalNumber('defaultEarthResistanceTargetOhm', 'Résistance de terre cible', { min: 0 }),
    defaultDesignWindSpeedKmh: reader.number('defaultDesignWindSpeedKmh', 'Vitesse de vent par défaut', { min: 0, max: 400 }),
    defaultCosPhi: reader.number('defaultCosPhi', 'cos φ par défaut', { min: 0.1, max: 1 }),
  };

  const anmeValidFrom = new Date(anmeValidFromRaw);
  const anmeValidTo = new Date(anmeValidToRaw);
  if (Number.isNaN(anmeValidFrom.getTime()) || Number.isNaN(anmeValidTo.getTime())) {
    reader.errors.push('Dates de validité ANME invalides.');
  } else if (anmeValidTo <= anmeValidFrom) {
    reader.errors.push('La fin de validité ANME doit être postérieure au début.');
  }
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  let logoFileId: string | undefined;
  if (logoResult) {
    const file = await db.file.create({ data: { fileName: logoResult.fileName, mimeType: logoResult.mimeType, storageKey: logoResult.storageKey } });
    logoFileId = file.id;
  }
  let anmeCertificateFileId: string | undefined;
  if (anmeCertificateResult) {
    const file = await db.file.create({ data: { fileName: anmeCertificateResult.fileName, mimeType: anmeCertificateResult.mimeType, storageKey: anmeCertificateResult.storageKey } });
    anmeCertificateFileId = file.id;
  }

  await db.company.update({
    where: { id: user.companyId },
    data: {
      ...data,
      anmeValidFrom,
      anmeValidTo,
      ...(logoFileId ? { logoFileId } : {}),
      ...(anmeCertificateFileId ? { anmeCertificateFileId } : {}),
    },
  });

  if (logoFileId && existing.logoFileId) {
    const oldFile = await db.file.findUnique({ where: { id: existing.logoFileId } });
    if (oldFile) {
      await deleteFile(oldFile.storageKey);
      await db.file.delete({ where: { id: oldFile.id } });
    }
  }
  if (anmeCertificateFileId && existing.anmeCertificateFileId) {
    const oldFile = await db.file.findUnique({ where: { id: existing.anmeCertificateFileId } });
    if (oldFile) {
      await deleteFile(oldFile.storageKey);
      await db.file.delete({ where: { id: oldFile.id } });
    }
  }

  redirect('/settings?saved=1');
  return undefined;
}
