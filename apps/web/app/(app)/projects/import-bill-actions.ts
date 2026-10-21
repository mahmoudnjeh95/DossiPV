'use server';

import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { redirect } from 'next/navigation';
import { db, Prisma } from '@dossipv/db';
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
import { summarizeSubscription } from '../../../lib/subscription';

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

const DAILY_BILL_IMPORT_LIMIT = 30;

/**
 * The single-phase proposals do not apply to these bills; the site is created three-phase.
 * "tri" is anchored at a word start so "électricité" does not match.
 */
const THREE_PHASE_OR_MV_TARIFF = /\btri|\bMT\b|moyenne tension/i;

/**
 * Reserves one of the company's daily bill readings. Every paid Claude call is counted, whether the
 * reading then succeeds or not; the serializable transaction stops concurrent requests from both
 * passing the check.
 */
async function reserveBillReading(companyId: string, now: Date): Promise<ImportBillState | null> {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  try {
    return await db.$transaction(
      async (tx) => {
        const attemptsToday = await tx.billImportAttempt.count({ where: { companyId, createdAt: { gte: since } } });
        if (attemptsToday >= DAILY_BILL_IMPORT_LIMIT) {
          return { error: `Limite de ${DAILY_BILL_IMPORT_LIMIT} factures importées par jour atteinte.` };
        }
        await tx.billImportAttempt.create({ data: { companyId } });
        return null;
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return { error: 'Trop de demandes simultanées, réessayez.' };
    }
    throw error;
  }
}

/** Same bounds as the corrections form: a value read outside them is dropped, not stored. */
function inBounds<T extends string | number>(
  value: T | null,
  label: string,
  fits: (v: T) => boolean,
  warnings: string[],
): T | null {
  if (value === null || fits(value)) return value;
  warnings.push(`Valeur lue hors limites ignorée : ${label}.`);
  return null;
}

/** Reads a STEG bill with Claude and creates the project (client, site, annex) from it. */
export async function importStegBillAction(
  _prevState: ImportBillState | undefined,
  formData: FormData,
): Promise<ImportBillState | undefined> {
  const user = await requireAuthenticatedCompanyUser();
  const now = new Date();

  const subscription = summarizeSubscription(
    await db.subscription.findUnique({ where: { companyId: user.companyId }, include: { plan: true } }),
    now,
  );
  if (!subscription || !subscription.canGenerate) {
    return { error: "Votre abonnement n'est pas actif : import de facture impossible." };
  }

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

  const refused = await reserveBillReading(user.companyId, now);
  if (refused) {
    return refused;
  }

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

  const threePhaseOrMv = reading.tariffLabel !== null && THREE_PHASE_OR_MV_TARIFF.test(reading.tariffLabel);
  if (threePhaseOrMv) {
    warnings.push('Facture triphasée ou moyenne tension détectée : les propositions automatiques ne couvrent que le BT monophasé.');
  }

  const clientName = inBounds(reading.clientName?.trim() || null, 'Nom du client', (v) => v.length <= 200, warnings);
  const stegReference = inBounds(reading.stegReference, 'Référence STEG', (v) => v.length <= 100, warnings);
  const subscribedPowerKVA = inBounds(reading.subscribedPowerKVA, 'Puissance souscrite', (v) => v >= 1 && v <= 100, warnings);
  const annualConsumptionKWh = inBounds(
    check.derived.annualConsumptionKWh,
    'Consommation annuelle',
    (v) => v >= 1 && v <= 1_000_000,
    warnings,
  );

  if (stegReference) {
    const duplicate = await db.project.findFirst({
      where: { companyId: user.companyId, client: { stegReference } },
      select: { id: true },
    });
    if (duplicate) {
      warnings.push(`Un autre projet existe déjà pour la référence STEG ${stegReference}.`);
    }
  }

  const tier = subscription.tier;
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
          fullName: clientName ?? 'Client à compléter',
          civility: reading.civility ? CIVILITY_FROM_BILL[reading.civility] : null,
          clientKind: 'residential',
          address: reading.address,
          city: reading.city,
          governorate: reading.governorate,
          stegReference,
          annualConsumptionKWh,
          subscribedPowerKVA,
        },
      });
      await tx.projectSite.create({
        data: {
          projectId: project.id,
          gpsLat: position.lat,
          gpsLon: position.lon,
          gridType: 'BT',
          phases: threePhaseOrMv ? 3 : 1,
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
          annualConsumptionKWh,
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
