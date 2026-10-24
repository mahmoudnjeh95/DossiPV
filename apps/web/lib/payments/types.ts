import type { PaymentMethod } from '@dossipv/db';

/** What a provider says about a checkout when asked directly (never taken from the browser). */
export type ProviderPaymentStatus = 'PAID' | 'PENDING' | 'FAILED';

export interface CreateCheckoutInput {
  /** Our PaymentIntent id: sent as the provider's tracking id. */
  intentId: string;
  /** What the client is charged, VAT and stamp duty included. */
  amountTnd: number;
  description: string;
  successUrl: string;
  failUrl: string;
  /** Absolute URL the provider calls when the payment completes. */
  webhookUrl: string;
}

export interface CreatedCheckout {
  providerReference: string;
  checkoutUrl: string;
}

export interface WebhookRequest {
  rawBody: string;
  headers: Headers;
}

/** A payment provider (online payment gateway). Only `createCheckout` and `verify` are required. */
export interface PaymentProvider {
  id: PaymentMethod;
  label: string;
  /** True when its credentials are set in the environment. */
  isEnabled(): boolean;
  createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout>;
  /** Asks the provider for the status of a checkout. Throws when the provider cannot be reached. */
  verify(providerReference: string): Promise<ProviderPaymentStatus>;
  /**
   * Authenticates a webhook call (signature) and returns the provider's payment id it is about,
   * or null when the call is not genuine. Absent when the provider has no webhook.
   */
  verifyWebhook?(request: WebhookRequest, now?: Date): string | null;
}

/** A refusal with a message fit for the user (French). */
export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}
