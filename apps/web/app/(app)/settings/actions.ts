'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import { FormReader } from '../../../lib/form-reader';

export interface SaveCompanyActionState {
  error: string;
}

const ANME_CATEGORIES = ['BT', 'MT', 'BT_MT'] as const;

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

  await db.company.update({ where: { id: user.companyId }, data: { ...data, anmeValidFrom, anmeValidTo } });
  redirect('/settings?saved=1');
  return undefined;
}
