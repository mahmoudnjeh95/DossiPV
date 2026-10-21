'use server';

import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { redirect } from 'next/navigation';
import { db, type Prisma } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';
import {
  BILL_READER_MODEL,
  BillReadingError,
  checkBillReading,
  findGovernorate,
  readStegBill,
  type BillInput,
  type BillMediaType,
  type StegBillReading,
} from '@dossipv/bill-reader';
import { requireAuthenticatedCompanyUser } from '../layout';
import { companyProjectTier } from '../../../lib/subscription';

export interface ImportBillState {
  error: string;
}

const TUNIS = { lat: 36.8065, lon: 10.1815 };

const CIVILITY_FROM_BILL: Record<NonNullable<StegBillReading['civility']>, string> = {
  M: 'M.',
  Mme: 'Mme',
  Mlle: 'Mme',
  societe: 'Société',
};

/** Reads a STEG bill with Claude and creates the project (client, site, annex) from it. */
export async function importStegBillAction(
  _prevState: ImportBillState | undefined,
  formData: FormData,
): Promise<ImportBillState | undefined> {
  const user = await requireAuthenticatedCompanyUser();

  const field = formData.get('bill');
  if (!(field instanceof File) || field.size === 0) {
    return { error: 'Aucun fichier reçu.' };
  }
  const buffer = Buffer.from(await field.arrayBuffer());
  const validation = validateUploadedFile(buffer, field.type, field.size, { allowWebp: true });
  if (!validation.valid) {
    return { error: validation.error };
  }

  // pdf-lib cannot embed WebP, so the stored annex is a JPEG (Claude still gets the original bytes).
  // Done before the paid Claude call so an unconvertible image costs nothing.
  let storedBuffer = buffer;
  let storedName = field.name;
  let storedContentType = field.type;
  if (validation.mimeType === 'webp') {
    try {
      storedBuffer = await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().jpeg({ quality: 90 }).toBuffer();
    } catch {
      return { error: 'Image de facture trop grande ou illisible.' };
    }
    storedName = `${field.name.replace(/\.[^.]*$/, '') || 'facture'}.jpg`;
    storedContentType = 'image/jpeg';
  }
  const storedMimeType = validation.mimeType === 'webp' ? 'jpeg' : validation.mimeType;

  let reading: StegBillReading;
  try {
    const input: BillInput = { bytes: buffer, mediaType: field.type as BillMediaType };
    reading = await readStegBill(input, new Anthropic());
  } catch (error) {
    if (error instanceof BillReadingError) {
      return { error: error.message };
    }
    return { error: 'Lecture de la facture impossible, réessayez.' };
  }
  const check = checkBillReading(reading);
  const warnings = [...check.warnings];

  const governorate = findGovernorate(reading.governorate);
  if (!governorate) {
    warnings.push('Gouvernorat non reconnu : position par défaut (Tunis).');
  }
  const position = governorate ?? { lat: TUNIS.lat, lon: TUNIS.lon };

  if (reading.stegReference) {
    const duplicate = await db.project.findFirst({
      where: { companyId: user.companyId, client: { stegReference: reading.stegReference } },
      select: { id: true },
    });
    if (duplicate) {
      warnings.push(`Un autre projet existe déjà pour la référence STEG ${reading.stegReference}.`);
    }
  }

  const tier = await companyProjectTier(user.companyId);
  const { storageKey } = await saveFile(storedBuffer, storedName, storedContentType);

  let projectId: string;
  try {
    projectId = await db.$transaction(async (tx) => {
      const file = await tx.file.create({ data: { fileName: storedName, mimeType: storedMimeType, storageKey } });
      const project = await tx.project.create({
        data: { companyId: user.companyId, tier, status: 'DRAFT', flowStep: 'PROPOSALS' },
      });
      await tx.projectClient.create({
        data: {
          projectId: project.id,
          fullName: reading.clientName?.trim() || 'Client à compléter',
          civility: reading.civility ? CIVILITY_FROM_BILL[reading.civility] : null,
          clientKind: 'residential',
          address: reading.address,
          city: reading.city,
          governorate: reading.governorate,
          stegReference: reading.stegReference,
          annualConsumptionKWh: check.derived.annualConsumptionKWh,
          subscribedPowerKVA: reading.subscribedPowerKVA,
        },
      });
      await tx.projectSite.create({
        data: {
          projectId: project.id,
          gpsLat: position.lat,
          gpsLon: position.lon,
          gridType: 'BT',
          phases: 1,
          mountingType: 'FLAT_ROOF_BALLAST',
          tiltDeg: 30,
          azimuthDeg: 0,
        },
      });
      await tx.projectAnnexes.create({ data: { projectId: project.id, lastPaidBillFileId: file.id } });
      await tx.projectBillImport.create({
        data: {
          projectId: project.id,
          fileId: file.id,
          reading: JSON.parse(JSON.stringify(reading)) as Prisma.InputJsonObject,
          warnings,
          annualConsumptionKWh: check.derived.annualConsumptionKWh,
          averagePriceTNDPerKWh: check.derived.averagePriceTNDPerKWh,
          modelId: BILL_READER_MODEL,
        },
      });
      return project.id;
    });
  } catch {
    await deleteFile(storageKey);
    return { error: 'Enregistrement impossible, réessayez.' };
  }

  redirect(`/projects/${projectId}/proposals`);
  return undefined;
}
