import { db } from '@dossipv/db';
import { adminEmailAddress, appUrl, sendEmail } from '@dossipv/email';

/**
 * Subscription expiry emails (master spec §8, launch spec §8): one at 7 days, one at 1 day and one
 * on expiry. Each is sent at most once per subscription and period end — the SubscriptionReminder
 * row is the "already sent" marker — so a renewed subscription (new periodEnd) gets fresh ones.
 * The rules mirror apps/web/lib/subscription.ts (summarizeSubscription), copied here because the
 * worker must not import from the web app.
 */

export type ReminderKind = 'EXPIRES_IN_7_DAYS' | 'EXPIRES_IN_1_DAY' | 'EXPIRED';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Same window as the web app's EXPIRY_WARNING_DAYS. */
export const EXPIRY_WARNING_DAYS = 7;
/** A period that ended longer ago than this is old data: no "expired" email for it any more. */
export const EXPIRED_REMINDER_MAX_AGE_DAYS = 30;

/** sendEmail's reason when SMTP is not set up: the email was logged, which counts as handled. */
const SMTP_NOT_CONFIGURED = 'SMTP is not configured';

/**
 * The single most relevant reminder for a period end, or null outside the reminder window.
 * A worker that was down through the 7-day mark sends the 1-day email only, never both late.
 */
export function reminderKindFor(periodEnd: Date, now: Date): ReminderKind | null {
  const msLeft = periodEnd.getTime() - now.getTime();
  if (msLeft <= 0) {
    return -msLeft > EXPIRED_REMINDER_MAX_AGE_DAYS * DAY_MS ? null : 'EXPIRED';
  }
  if (msLeft <= DAY_MS) return 'EXPIRES_IN_1_DAY';
  if (msLeft <= EXPIRY_WARNING_DAYS * DAY_MS) return 'EXPIRES_IN_7_DAYS';
  return null;
}

const frenchDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', day: '2-digit', month: '2-digit', year: 'numeric' });

/** dd/mm/yyyy, in Tunisian time. */
export function formatFrenchDate(date: Date): string {
  return frenchDate.format(date);
}

interface ReminderRecipientCompany {
  email: string;
  users: { email: string; role: 'OWNER' | 'MEMBER'; disabledAt: Date | null }[];
}

/** The company's enabled owners plus the company's own address, de-duplicated (case-insensitive). */
export function reminderRecipients(company: ReminderRecipientCompany): string[] {
  const candidates = [...company.users.filter((user) => user.role === 'OWNER' && user.disabledAt === null).map((user) => user.email), company.email];
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const candidate of candidates) {
    const email = candidate?.trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    recipients.push(email);
  }
  return recipients;
}

/** The « Abonnement et paiement » page of the company's space, where it pays by Flouci, izi or D17. */
export function billingPath(companyKind: 'INSTALLER' | 'SUPPLIER'): string {
  return companyKind === 'SUPPLIER' ? '/fournisseur/facturation' : '/facturation';
}

interface ReminderEmailInput {
  kind: ReminderKind;
  companyName: string;
  planName: string;
  periodEnd: Date;
  now: Date;
}

export function buildReminderEmail({ kind, companyName, planName, periodEnd, now }: ReminderEmailInput): { subject: string; text: string } {
  const endDate = formatFrenchDate(periodEnd);
  const contact = adminEmailAddress();
  const pay =
    "Pour renouveler, ouvrez la page « Abonnement et paiement » de votre espace SolarixPro : choisissez la durée, envoyez le montant par Flouci, izi ou D17 puis déclarez-le avec une capture du transfert.";
  const renew = contact
    ? `${pay} Une question ? Contactez SolarixPro à l'adresse ${contact}.`
    : `${pay} Une question ? Contactez l'équipe SolarixPro.`;
  const subscription = `Votre abonnement SolarixPro (formule ${planName}) pour ${companyName}`;

  if (kind === 'EXPIRED') {
    return {
      subject: 'Votre abonnement SolarixPro a expiré',
      text: [
        'Bonjour,',
        `${subscription} a expiré le ${endDate}.`,
        "Vous pouvez toujours consulter et télécharger vos projets et dossiers existants, mais la génération de nouveaux dossiers est bloquée jusqu'au renouvellement.",
        renew,
      ].join('\n\n'),
    };
  }

  const daysLeft = Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS);
  const when = kind === 'EXPIRES_IN_1_DAY' ? 'dans moins de 24 heures' : `dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`;
  return {
    subject: kind === 'EXPIRES_IN_1_DAY' ? `Dernier jour : votre abonnement SolarixPro expire le ${endDate}` : `Votre abonnement SolarixPro expire le ${endDate}`,
    text: [
      'Bonjour,',
      `${subscription} expire le ${endDate}, ${when}.`,
      'Après cette date, vous pourrez toujours consulter et télécharger vos projets et dossiers existants, mais vous ne pourrez plus générer de nouveaux dossiers.',
      'Pensez à préparer votre paiement dès maintenant : la validation du transfert par SolarixPro peut prendre un peu de temps.',
      renew,
    ].join('\n\n'),
  };
}

const isUniqueViolation = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'P2002';

export interface ExpiryReminderSummary {
  /** Subscriptions in the reminder window. */
  checked: number;
  /** Reminders handed to the mail provider (or logged, without SMTP) this run. */
  sent: number;
}

/**
 * Records the reminder, then emails it; true when it went out this run. The row goes in first: the
 * unique (subscription, periodEnd, kind) key is what guarantees one email, even with two workers
 * running the check at the same time. A provider refusal removes the row so the next run retries.
 */
async function deliverOnce(
  reminder: { subscriptionId: string; periodEnd: Date; kind: ReminderKind | 'OPTION_3D_EXPIRES_IN_7_DAYS' },
  message: Parameters<typeof sendEmail>[0],
): Promise<boolean> {
  let reminderId: string;
  try {
    const row = await db.subscriptionReminder.create({ data: reminder, select: { id: true } });
    reminderId = row.id;
  } catch (error) {
    if (!isUniqueViolation(error)) {
      console.error(`sendExpiryReminders: reminder ${reminder.kind} for subscription ${reminder.subscriptionId} not recorded`, error);
    }
    return false;
  }

  const result = await sendEmail(message);
  if (result.sent || result.reason === SMTP_NOT_CONFIGURED) return true;
  try {
    await db.subscriptionReminder.delete({ where: { id: reminderId } });
  } catch (error) {
    console.error(`sendExpiryReminders: reminder ${reminderId} could not be cleared for a retry`, error);
  }
  return false;
}

export async function sendExpiryReminders(now: Date = new Date()): Promise<ExpiryReminderSummary> {
  const subscriptions = await db.subscription.findMany({
    where: {
      status: { not: 'SUSPENDED' },
      periodEnd: {
        lte: new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS),
        gte: new Date(now.getTime() - EXPIRED_REMINDER_MAX_AGE_DAYS * DAY_MS),
      },
    },
    select: {
      id: true,
      status: true,
      periodEnd: true,
      plan: { select: { name: true } },
      company: { select: { name: true, email: true, kind: true, users: { select: { email: true, role: true, disabledAt: true } } } },
    },
  });

  let checked = 0;
  let sent = 0;
  for (const subscription of subscriptions) {
    // Re-checked here as well as in the query: a suspended account never gets expiry emails.
    if (subscription.status === 'SUSPENDED') continue;
    const kind = reminderKindFor(subscription.periodEnd, now);
    if (!kind) continue;
    checked += 1;

    const to = reminderRecipients(subscription.company);
    if (to.length === 0) continue;

    const email = buildReminderEmail({
      kind,
      companyName: subscription.company.name,
      planName: subscription.plan.name,
      periodEnd: subscription.periodEnd,
      now,
    });
    const delivered = await deliverOnce(
      { subscriptionId: subscription.id, periodEnd: subscription.periodEnd, kind },
      { to, ...email, action: { label: 'Préparer mon paiement', url: appUrl(billingPath(subscription.company.kind)) } },
    );
    if (delivered) sent += 1;
  }
  return { checked, sent };
}

export function buildOption3dReminderEmail({ companyName, option3dUntil, now }: { companyName: string; option3dUntil: Date; now: Date }): { subject: string; text: string } {
  const endDate = formatFrenchDate(option3dUntil);
  const daysLeft = Math.ceil((option3dUntil.getTime() - now.getTime()) / DAY_MS);
  const contact = adminEmailAddress();
  return {
    subject: `Votre option 3D SolarixPro expire le ${endDate}`,
    text: [
      'Bonjour,',
      `L'option 3D SolarixPro de ${companyName} expire le ${endDate}, dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`,
      "Après cette date, vos nouveaux projets n'incluront plus la vue 3D du champ sur la toiture. Votre plan offert par votre fournisseur continue normalement.",
      'Pensez à préparer votre paiement dès maintenant : la validation du transfert par SolarixPro peut prendre un peu de temps.',
      `Pour prolonger l'option, ouvrez la page « Abonnement et paiement » de votre espace SolarixPro : choisissez la durée, envoyez le montant par Flouci, izi ou D17 puis déclarez-le avec une capture du transfert. Une question ? ${contact ? `Contactez SolarixPro à l'adresse ${contact}.` : "Contactez l'équipe SolarixPro."}`,
    ].join('\n\n'),
  };
}

/**
 * The 3D option a sponsored installer pays for itself (its plan is its supplier's) gets one email
 * 7 days before it ends. Its date lives on a Subscription row that is usually SUSPENDED (see
 * extendOption3dUntil in the web app), which sendExpiryReminders skips, hence this separate check.
 * No email when the supplier's plan is Premium: Premium includes 3D, the option no longer matters.
 */
export async function sendOption3dReminders(now: Date = new Date()): Promise<ExpiryReminderSummary> {
  const subscriptions = await db.subscription.findMany({
    where: {
      option3dUntil: { gt: now, lte: new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS) },
      company: { sponsorCompanyId: { not: null } },
    },
    select: {
      id: true,
      option3dUntil: true,
      company: {
        select: {
          name: true,
          email: true,
          users: { select: { email: true, role: true, disabledAt: true } },
          sponsor: { select: { subscription: { select: { plan: { select: { tier: true } } } } } },
        },
      },
    },
  });

  let checked = 0;
  let sent = 0;
  for (const subscription of subscriptions) {
    const option3dUntil = subscription.option3dUntil;
    if (!option3dUntil || subscription.company.sponsor?.subscription?.plan.tier === 'PREMIUM') continue;
    checked += 1;
    const to = reminderRecipients(subscription.company);
    if (to.length === 0) continue;
    const email = buildOption3dReminderEmail({ companyName: subscription.company.name, option3dUntil, now });
    const delivered = await deliverOnce(
      { subscriptionId: subscription.id, periodEnd: option3dUntil, kind: 'OPTION_3D_EXPIRES_IN_7_DAYS' },
      { to, ...email, action: { label: 'Préparer mon paiement', url: appUrl(billingPath('INSTALLER')) } },
    );
    if (delivered) sent += 1;
  }
  return { checked, sent };
}
