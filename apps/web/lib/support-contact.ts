import { adminEmailAddress } from '@dossipv/email';

/** How to reach SolarixPro, from the environment: SUPPORT_PHONE, SUPPORT_WHATSAPP and SUPPORT_EMAIL (ADMIN_EMAIL when unset). */
export interface SupportContact {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
}

function clean(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function supportContact(): SupportContact {
  return {
    phone: clean(process.env.SUPPORT_PHONE),
    whatsapp: clean(process.env.SUPPORT_WHATSAPP),
    email: clean(process.env.SUPPORT_EMAIL) ?? adminEmailAddress(),
  };
}

/** `tel:` link target: digits and a leading +, no spaces. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** wa.me link target: digits only, with the Tunisian country code added to a bare 8-digit number. */
export function whatsappHref(number: string): string {
  const digits = number.replace(/\D/g, '');
  return `https://wa.me/${digits.length === 8 ? `216${digits}` : digits}`;
}

export function mailHref(email: string): string {
  return `mailto:${email}`;
}
