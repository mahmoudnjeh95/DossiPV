import { db, type PaymentMethod } from '@dossipv/db';
import { priceCheckout, type PaymentPurposeName } from './pricing';
import { getEnabledProvider } from './registry';
import { CheckoutError } from './types';

/** The address of the app as users reach it (APP_URL), for the links the provider calls or redirects to. */
function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/**
 * Opens an online checkout: refuses what the company cannot buy, records a PENDING intent, asks the
 * provider for the checkout page and returns its address. The intent is marked FAILED when the
 * provider cannot be reached, so the admin sees the attempt. Throws CheckoutError (French).
 */
export async function startCheckout(
  companyId: string,
  input: { purpose: PaymentPurposeName; planId: string | null; months: number; provider: PaymentMethod },
): Promise<{ intentId: string; checkoutUrl: string }> {
  const provider = getEnabledProvider(input.provider);
  if (!provider) throw new CheckoutError('Ce moyen de paiement n’est pas disponible : choisissez-en un autre ou contactez DossiPV.');
  const price = await priceCheckout(companyId, input);

  const intent = await db.paymentIntent.create({
    data: {
      companyId,
      purpose: price.purpose,
      planId: price.planId,
      months: price.months,
      amountTnd: price.ttcTnd,
      provider: provider.id,
    },
  });
  try {
    const returnUrl = `${appUrl()}/paiement/retour?intent=${encodeURIComponent(intent.id)}`;
    const checkout = await provider.createCheckout({
      intentId: intent.id,
      amountTnd: price.ttcTnd,
      description: price.description,
      successUrl: returnUrl,
      failUrl: returnUrl,
      webhookUrl: `${appUrl()}/api/payments/${provider.id.toLowerCase()}/webhook`,
    });
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: { providerReference: checkout.providerReference, checkoutUrl: checkout.checkoutUrl },
    });
    return { intentId: intent.id, checkoutUrl: checkout.checkoutUrl };
  } catch (error) {
    console.error(`payments: checkout creation failed for intent ${intent.id}`, error);
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'FAILED', failureReason: 'Le fournisseur n’a pas créé la page de paiement.' },
    });
    throw new CheckoutError('Le service de paiement ne répond pas pour le moment : réessayez dans quelques minutes.');
  }
}
