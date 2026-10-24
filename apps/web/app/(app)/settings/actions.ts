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

/** What a self sign-up company holds as ANME validity dates until its profile is filled. */
const PLACEHOLDER_ANME_DATE = new Date('2000-01-01');

/** An ANME code compared without case, spaces or dashes ("anme-001" = "ANME 001"). */
function normalizeAnmeCode(code: string): string {
  return code.replace(/[\s\-‐-―]/g, '').toLowerCase();
}

/** A voltage-drop limit in % : 0 < x <= 10 (FormReader bounds are inclusive, so 0 is rejected here). */
function positiveDropPct(reader: FormReader, name: string, label: string): number {
  const value = reader.number(name, label, { max: 10 });
  if (value <= 0 && !reader.hasErrors) reader.errors.push(`${label} : doit être > 0.`);
  return value;
}

/**
 * The counter to store for the typed « Prochain numéro de dossier » (the counter is the last
 * number used, so next − 1), or undefined to leave it alone. It is written only when the installer
 * changed the value shown on the page: re-saving the form for another field must not rewind a
 * counter that a generation moved since the page was opened, which would reuse a number.
 */
function nextDossierCounter(reader: FormReader): number | undefined {
  const label = 'Prochain numéro de dossier';
  const next = reader.optionalInteger('dossierNextNumber', label, { min: 1, max: 1_000_000_000 });
  if (next === null || next < 1) return undefined;
  const shown = reader.optionalInteger('dossierNextNumberShown', label);
  return next === shown ? undefined : next - 1;
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

  const existing = await db.company.findUnique({ where: { id: user.companyId }, select: { logoFileId: true, anmeCertificateFileId: true, profileComplete: true } });
  if (!existing) {
    return { error: 'Société introuvable.' };
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
    defaultMaxVoltageDropPct: positiveDropPct(reader, 'defaultMaxVoltageDropPct', 'Chute de tension maximale DC par défaut'),
    defaultMaxAcVoltageDropPct: positiveDropPct(reader, 'defaultMaxAcVoltageDropPct', 'Chute de tension maximale AC par défaut'),
    defaultEarthResistanceTargetOhm: reader.optionalNumber('defaultEarthResistanceTargetOhm', 'Résistance de terre cible', { min: 0 }),
    defaultDesignWindSpeedKmh: reader.number('defaultDesignWindSpeedKmh', 'Vitesse de vent par défaut', { min: 0, max: 400 }),
    defaultCosPhi: reader.number('defaultCosPhi', 'cos φ par défaut', { min: 0.1, max: 1 }),
    dossierPrefix: reader.optionalText('dossierPrefix', 'Préfixe de numérotation des dossiers', 20),
  };
  const dossierCounter = nextDossierCounter(reader);

  const anmeValidFrom = new Date(anmeValidFromRaw);
  const anmeValidTo = new Date(anmeValidToRaw);
  if (Number.isNaN(anmeValidFrom.getTime()) || Number.isNaN(anmeValidTo.getTime())) {
    reader.errors.push('Dates de validité ANME invalides.');
  } else {
    if (anmeValidTo <= anmeValidFrom) {
      reader.errors.push('La fin de validité ANME doit être postérieure au début.');
    }
    // The sign-up placeholder (2000-01-01) is not a real agreement date.
    if (anmeValidFrom.getTime() === PLACEHOLDER_ANME_DATE.getTime()) {
      reader.errors.push('Début de validité ANME : saisissez la date réelle de votre agrément.');
    }
    // A profile still to be completed needs a real, running agreement. Once complete, an agreement
    // that has just expired must not stop the installer from editing anything else (logo, address…):
    // the dossier's own ANME checks (C20/C22) refuse a generation under an expired agreement.
    if (!existing.profileComplete && anmeValidTo <= new Date()) {
      reader.errors.push('Votre agrément ANME est expiré : la fin de validité doit être dans le futur.');
    }
  }
  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  // The code identifies the installer on dossiers: unique among companies, ignoring case, spaces and dashes.
  const wanted = normalizeAnmeCode(data.anmeCode);
  const others = await db.company.findMany({ where: { id: { not: user.companyId } }, select: { name: true, anmeCode: true } });
  const sameAnme = others.find((other) => normalizeAnmeCode(other.anmeCode) === wanted);
  if (sameAnme) {
    return { error: `Ce code ANME est déjà inscrit (${sameAnme.name}).` };
  }

  const logoResult = await uploadIfPresent(formData, 'logo');
  if (logoResult && 'error' in logoResult) {
    return { error: logoResult.error };
  }
  const anmeCertificateResult = await uploadIfPresent(formData, 'anmeCertificate');
  if (anmeCertificateResult && 'error' in anmeCertificateResult) {
    return { error: anmeCertificateResult.error };
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
      // Address, legal representative, ANME category and validity all passed above: the profile is complete.
      profileComplete: true,
      ...(dossierCounter !== undefined ? { dossierCounter } : {}),
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
