'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { createPasswordResetToken, RateLimiter } from '@dossipv/auth';
import { db } from '@dossipv/db';
import { appUrl, sendEmail } from '@dossipv/email';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
// Every request counts (not only failures): one mailbox cannot be flooded with reset emails,
// and one client cannot sweep through addresses. RateLimiter locks on the Nth recorded hit, so
// N = allowed + 1: 5 requests per address and 20 per client in any 15 minutes.
const perEmailLimiter = new RateLimiter(5 + 1, WINDOW_MS);
const perClientLimiter = new RateLimiter(20 + 1, WINDOW_MS);

/** Same answer for a known, unknown or disabled address, so accounts cannot be enumerated.
 *  (Not exported: a 'use server' module may only export async functions.) */
const RESET_REQUEST_CONFIRMATION =
  "Si un compte existe pour cette adresse, un email avec un lien vient d'être envoyé. Pensez à vérifier vos courriers indésirables.";

export type ForgotPasswordState = { sent: true; message: string } | { sent: false; error: string };

/** The client address as nginx saw it (X-Real-IP is overwritten by nginx, a client cannot spoof it). */
async function clientKey(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get('x-real-ip')?.trim() || 'unknown';
}

export async function requestPasswordResetAction(
  _prevState: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const emailField = formData.get('email');
  const email = typeof emailField === 'string' ? emailField.trim().toLowerCase() : '';
  if (email.length === 0 || email.length > 200) {
    return { sent: false, error: 'Saisissez votre adresse e-mail.' };
  }

  // Counted before the lookup, so being limited says nothing about whether the account exists.
  const clientLimited = perClientLimiter.recordFailure(await clientKey());
  const emailLimited = perEmailLimiter.recordFailure(email);
  if (clientLimited || emailLimited) {
    return { sent: false, error: 'Trop de demandes. Réessayez dans quelques minutes.' };
  }

  const user = await db.companyUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, disabledAt: true },
  });

  if (user && !user.disabledAt) {
    // Created and sent after the response, so a known address does not answer measurably
    // slower than an unknown one. sendEmail never throws: a provider failure is logged on the
    // server, never shown here.
    const { id, email: to } = user;
    after(async () => {
      const token = await createPasswordResetToken(id);
      await sendEmail({
        to,
        subject: 'Réinitialisation de votre mot de passe SolarixPro',
        text:
          'Bonjour,\n\n' +
          'Vous avez demandé à changer le mot de passe de votre compte SolarixPro. ' +
          'Le lien ci-dessous est valable 1 heure et ne peut servir qu’une fois.\n\n' +
          'Si vous n’êtes pas à l’origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.',
        action: {
          label: 'Choisir un nouveau mot de passe',
          url: appUrl(`/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`),
        },
      });
    });
  }

  return { sent: true, message: RESET_REQUEST_CONFIRMATION };
}
