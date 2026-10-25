import sharp from 'sharp';
import { db } from '@dossipv/db';
import { validateUploadedFile } from '@dossipv/file-storage';
import { loadP2pSettings, MAX_OPEN_INTENTS, MAX_PROOF_BYTES, offeredProviders, PaymentError, PROOF_RETENTION_DAYS, type P2pProviderId } from './p2p';
import { priceCheckout, type PaymentPurposeName } from './pricing';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REFERENCE_LENGTH = 100;
const PROOF_MAX_SIDE_PX = 1600;

/**
 * Opens a payment intent (PENDING, not declared yet): refuses what the company cannot buy, a
 * provider without a number, and more than MAX_OPEN_INTENTS open intents. Throws PaymentError (French).
 */
export async function createIntent(
  companyId: string,
  input: { purpose: PaymentPurposeName; planId: string | null; months: number; provider: P2pProviderId },
): Promise<{ intentId: string }> {
  const settings = await loadP2pSettings();
  if (!offeredProviders(settings).some((p) => p.id === input.provider)) {
    throw new PaymentError('Ce moyen de paiement n’est pas disponible : choisissez-en un autre ou contactez SolarixPro.');
  }
  const open = await db.paymentIntent.count({ where: { companyId, status: 'PENDING' } });
  if (open >= MAX_OPEN_INTENTS) {
    throw new PaymentError('Vous avez déjà un paiement en cours : terminez-le (ou annulez-le) avant d’en commencer un autre.');
  }
  const price = await priceCheckout(companyId, input);
  const intent = await db.paymentIntent.create({
    data: { companyId, purpose: price.purpose, planId: price.planId, months: price.months, amountTnd: price.amountTnd, provider: input.provider },
    select: { id: true },
  });
  return { intentId: intent.id };
}

/** Cancels the company's own intent while it is still open (declared or not). */
export async function cancelIntent(companyId: string, intentId: string): Promise<void> {
  const result = await db.paymentIntent.updateMany({ where: { id: intentId, companyId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (result.count !== 1) throw new PaymentError('Ce paiement ne peut plus être annulé.');
}

/**
 * Validates a screenshot (PNG, JPEG or WebP, 8 Mo at most, content checked) and re-encodes it as a
 * JPEG of 1600 px at most on the long side, so the rows stay small. Throws PaymentError (French).
 */
export async function prepareProofImage(file: { buffer: Buffer; type: string; size: number }): Promise<Buffer> {
  if (file.size === 0) throw new PaymentError('Ajoutez la capture d’écran du virement.');
  if (file.size > MAX_PROOF_BYTES) throw new PaymentError('La capture dépasse la taille maximale (8 Mo).');
  const validation = validateUploadedFile(file.buffer, file.type, file.size, { allowWebp: true });
  if (!validation.valid) throw new PaymentError(validation.error);
  if (validation.mimeType === 'pdf') throw new PaymentError('La capture doit être une image (PNG, JPEG ou WebP).');
  try {
    return await sharp(file.buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: PROOF_MAX_SIDE_PX, height: PROOF_MAX_SIDE_PX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new PaymentError('Image illisible ou trop grande.');
  }
}

/**
 * The payer declares it has sent the money: screenshot (required) and sender number or transfer
 * reference (required). The intent stays PENDING; it can be declared again (new screenshot) until
 * the admin decides. The screenshot expires after PROOF_RETENTION_DAYS (the worker erases it).
 */
export async function declareIntent(
  companyId: string,
  intentId: string,
  input: { file: { buffer: Buffer; type: string; size: number } | null; reference: string },
  now: Date = new Date(),
): Promise<void> {
  const reference = input.reference.trim();
  if (reference === '') throw new PaymentError('Indiquez le numéro d’envoi ou la référence du virement.');
  if (reference.length > MAX_REFERENCE_LENGTH) throw new PaymentError(`Numéro ou référence trop long (${MAX_REFERENCE_LENGTH} caractères au plus).`);
  if (!input.file) throw new PaymentError('Ajoutez la capture d’écran du virement.');
  const jpeg = await prepareProofImage(input.file);

  const result = await db.paymentIntent.updateMany({
    where: { id: intentId, companyId, status: 'PENDING' },
    data: {
      providerReference: reference,
      declaredAt: now,
      proofImage: new Uint8Array(jpeg),
      proofMime: 'image/jpeg',
      proofExpiresAt: new Date(now.getTime() + PROOF_RETENTION_DAYS * DAY_MS),
    },
  });
  if (result.count !== 1) throw new PaymentError('Ce paiement n’accepte plus de déclaration.');
}
