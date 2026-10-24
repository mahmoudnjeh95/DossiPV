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
  const renew = contact
    ? `Pour renouveler votre abonnement, contactez SolarixPro à l'adresse ${contact}.`
    : "Pour renouveler votre abonnement, contactez l'équipe SolarixPro.";
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
      company: { select: { name: true, email: true, users: { select: { email: true, role: true, disabledAt: true } } } },
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

    // The row goes in first: the unique (subscription, periodEnd, kind) key is what guarantees
    // one email, even with two workers running the check at the same time.
    let reminderId: string;
    try {
      const reminder = await db.subscriptionReminder.create({
        data: { subscriptionId: subscription.id, periodEnd: subscription.periodEnd, kind },
        select: { id: true },
      });
      reminderId = reminder.id;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        console.error(`sendExpiryReminders: reminder ${kind} for subscription ${subscription.id} not recorded`, error);
      }
      continue;
    }

    const email = buildReminderEmail({
      kind,
      companyName: subscription.company.name,
      planName: subscription.plan.name,
      periodEnd: subscription.periodEnd,
      now,
    });
    const result = await sendEmail({ to, ...email, action: { label: 'Ouvrir mon tableau de bord', url: appUrl('/dashboard') } });
    if (result.sent || result.reason === SMTP_NOT_CONFIGURED) {
      sent += 1;
      continue;
    }
    // The provider refused: forget the reminder so the next run tries again.
    try {
      await db.subscriptionReminder.delete({ where: { id: reminderId } });
    } catch (error) {
      console.error(`sendExpiryReminders: reminder ${reminderId} could not be cleared for a retry`, error);
    }
  }
  return { checked, sent };
}
