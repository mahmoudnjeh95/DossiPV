import Link from 'next/link';
import { InvalidVerificationTokenError, verifyEmailWithToken } from '@dossipv/auth';
import { db } from '@dossipv/db';
import { adminEmailAddress, appUrl, sendEmail } from '@dossipv/email';
import { PublicShell } from '../inscription/public-shell';
import { ResendVerificationForm } from '../inscription/resend-form';
import {
  AuthBackLink,
  AuthError,
  AuthIntro,
  AuthNotice,
  authSubmitClass,
} from '@/components/auth/auth-ui';

// Public page, reached from the sign-up email. Opening the link confirms the address and starts
// the free trial, so it must never be cached or prerendered.
export const dynamic = 'force-dynamic';

const TRIAL_DAYS = 30;
const TRIAL_DOSSIERS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

type Outcome = 'confirmed' | 'invalid' | 'no-trial-plan';

/**
 * Confirms the address, then starts the trial: Essai gratuit, ACTIVE, 30 days, only for a
 * company that has no subscription yet. The trial plan is looked up first, so a missing plan
 * leaves the link unused (nothing half done) and the installer can retry once support fixed it.
 */
async function confirmEmail(token: string): Promise<Outcome> {
  if (!token) return 'invalid';
  const trialPlan = await db.plan.findFirst({
    where: { isTrial: true, archivedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!trialPlan) return 'no-trial-plan';

  let verified: { companyUserId: string; companyId: string; email: string };
  try {
    verified = await verifyEmailWithToken(token);
  } catch (error) {
    if (error instanceof InvalidVerificationTokenError) return 'invalid';
    throw error;
  }

  const periodStart = new Date();
  const trialStarted = await db.$transaction(async (tx) => {
    if (await tx.subscription.findUnique({ where: { companyId: verified.companyId } }))
      return false;
    await tx.subscription.create({
      data: {
        companyId: verified.companyId,
        planId: trialPlan.id,
        status: 'ACTIVE',
        periodStart,
        periodEnd: new Date(periodStart.getTime() + TRIAL_DAYS * DAY_MS),
      },
    });
    return true;
  });

  // The link works once, so these go out once; sendEmail never throws.
  if (trialStarted) {
    const company = await db.company.findUnique({
      where: { id: verified.companyId },
      select: {
        name: true,
        phone: true,
        anmeCode: true,
        signupContactName: true,
        signupGovernorate: true,
      },
    });
    await sendWelcomeEmail(verified.email);
    await sendAdminNotification(verified.email, company, periodStart);
  }
  return 'confirmed';
}

async function sendWelcomeEmail(to: string): Promise<void> {
  const admin = adminEmailAddress();
  await sendEmail({
    to,
    subject: 'Bienvenue sur SolarixPro : votre essai gratuit est activé',
    text:
      'Bonjour,\n\n' +
      `Votre adresse est confirmée. Votre essai gratuit vous donne ${TRIAL_DOSSIERS} dossiers pendant ${TRIAL_DAYS} jours.\n\n` +
      'Prochaine étape : connectez-vous, complétez les informations de votre société dans Paramètres, puis créez votre premier projet. ' +
      'À la fin de l’essai, vous gardez l’accès à vos projets et à vos dossiers ; pour en générer de nouveaux, nous vous proposons un abonnement.' +
      (admin ? `\n\nUne question ? Écrivez-nous : ${admin}.` : ''),
    action: { label: 'Me connecter', url: appUrl('/login') },
  });
}

async function sendAdminNotification(
  email: string,
  company: {
    name: string;
    phone: string;
    anmeCode: string;
    signupContactName: string | null;
    signupGovernorate: string | null;
  } | null,
  at: Date,
): Promise<void> {
  const admin = adminEmailAddress();
  if (!admin) return;
  await sendEmail({
    to: admin,
    subject: `Nouvelle inscription SolarixPro : ${company?.name ?? email}`,
    text:
      'Une société vient de confirmer son inscription et de démarrer son essai gratuit.\n\n' +
      `Société : ${company?.name ?? '—'}\n` +
      `Contact : ${company?.signupContactName ?? '—'}\n` +
      `Téléphone : ${company?.phone ?? '—'}\n` +
      `Email : ${email}\n` +
      `Gouvernorat : ${company?.signupGovernorate ?? '—'}\n` +
      `Code ANME : ${company?.anmeCode ?? '—'}\n` +
      `Date : ${at.toLocaleString('fr-FR', { timeZone: 'Africa/Tunis' })}`,
    action: { label: 'Voir les inscriptions', url: appUrl('/admin/inscriptions') },
  });
}

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps): Promise<React.JSX.Element> {
  const { token: tokenParam } = await searchParams;
  const outcome = await confirmEmail(typeof tokenParam === 'string' ? tokenParam : '');
  const admin = adminEmailAddress();

  return (
    <PublicShell titleId="verify-title" eyebrow="CONFIRMATION DE L’EMAIL">
      {outcome === 'confirmed' && (
        <>
          <h2 id="verify-title">Email confirmé, connectez-vous.</h2>
          <AuthNotice>
            Votre essai gratuit est activé : {TRIAL_DOSSIERS} dossiers pendant {TRIAL_DAYS} jours.
          </AuthNotice>
          <Link href="/login" className={authSubmitClass()}>
            Me connecter <span aria-hidden="true">→</span>
          </Link>
        </>
      )}
      {outcome === 'invalid' && (
        <>
          <h2 id="verify-title">Ce lien n’est plus valide.</h2>
          <AuthIntro>
            Il a déjà servi, a expiré ou a été remplacé par un lien plus récent. Saisissez votre
            adresse pour recevoir un nouvel email de confirmation.
          </AuthIntro>
          <ResendVerificationForm />
        </>
      )}
      {outcome === 'no-trial-plan' && (
        <>
          <h2 id="verify-title">Activation momentanément impossible.</h2>
          <AuthError>
            L’essai gratuit n’est pas disponible pour le moment. Votre lien reste valable :
            contactez le support{admin ? ` (${admin})` : ''} puis rouvrez ce lien.
          </AuthError>
        </>
      )}
      <AuthBackLink href="/login">Retour à la connexion</AuthBackLink>
    </PublicShell>
  );
}
