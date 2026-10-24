import { db } from '@dossipv/db';
import { adminEmailAddress, appUrl, sendEmail } from '@dossipv/email';
import { payerRefusal } from './p2p';

/** Longest message accepted, in characters. */
export const MAX_MESSAGE_LENGTH = 1000;
/** Messages one side can write on one payment in 24 hours. */
export const MAX_MESSAGES_PER_DAY = 30;
/** Minimum gap between two messages of the same side on a payment. */
export const MIN_MESSAGE_GAP_MS = 2000;
/** How long the chat stays writable after the payment was confirmed. */
export const CHAT_DAYS_AFTER_DECISION = 30;
/** How many messages a conversation shows (the latest ones). */
const LIST_ROWS = 200;
/** The name the payer sees for the admin. */
export const ADMIN_DISPLAY_NAME = 'SolarixPro';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ChatSide = 'COMPANY' | 'ADMIN';

/** A message as the browser gets it: plain text, dates as ISO strings. */
export interface ChatMessage {
  id: string;
  author: ChatSide;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ChatSnapshot {
  messages: ChatMessage[];
  /** False once the conversation is over (read-only). */
  open: boolean;
}

export type ChatResult = { ok: true } | { ok: false; error: string; notFound?: boolean };

const NOT_FOUND: ChatResult = { ok: false, error: 'Paiement introuvable.', notFound: true };
export const CHAT_CLOSED_MESSAGE = 'Conversation terminée.';

type IntentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';

/**
 * Whether the chat of a payment still takes messages: while it is open (PENDING) or refused
 * (FAILED, the payer may explain), and for 30 days after a confirmation. A cancelled payment is closed.
 */
export function chatOpen(intent: { status: IntentStatus; paidAt: Date | null }, now: Date = new Date()): boolean {
  if (intent.status === 'PENDING' || intent.status === 'FAILED') return true;
  if (intent.status === 'PAID' && intent.paidAt) return now.getTime() - intent.paidAt.getTime() <= CHAT_DAYS_AFTER_DECISION * DAY_MS;
  return false;
}

/** The text to store, or the French reason it is refused. */
export function readMessageBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim() : '';
  if (body.length === 0) return { ok: false, error: 'Écrivez un message.' };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Message trop long : ${MAX_MESSAGE_LENGTH} caractères au plus.` };
  return { ok: true, body };
}

/** The latest messages of a payment, oldest first. */
export async function listMessages(intentId: string): Promise<ChatMessage[]> {
  const rows = await db.paymentMessage.findMany({
    where: { intentId },
    orderBy: { createdAt: 'desc' },
    take: LIST_ROWS,
    select: { id: true, author: true, authorName: true, body: true, createdAt: true },
  });
  return rows.reverse().map((row) => ({ id: row.id, author: row.author, authorName: row.authorName, body: row.body, createdAt: row.createdAt.toISOString() }));
}

/** Messages + whether the chat is still open, for the pages and the polling routes. */
export async function chatSnapshot(intent: { id: string; status: IntentStatus; paidAt: Date | null }): Promise<ChatSnapshot> {
  return { messages: await listMessages(intent.id), open: chatOpen(intent) };
}

/** The payer has read the admin's messages. */
export async function markReadByCompany(intentId: string): Promise<void> {
  await db.paymentMessage.updateMany({ where: { intentId, author: 'ADMIN', readByCompanyAt: null }, data: { readByCompanyAt: new Date() } });
}

/** The admin has read the payer's messages. */
export async function markReadByAdmin(intentId: string): Promise<void> {
  await db.paymentMessage.updateMany({ where: { intentId, author: 'COMPANY', readByAdminAt: null }, data: { readByAdminAt: new Date() } });
}

/** Unread admin messages per payment of a company (payments without any are absent). */
export async function unreadForCompany(companyId: string): Promise<Map<string, number>> {
  const rows = await db.paymentMessage.groupBy({
    by: ['intentId'],
    where: { author: 'ADMIN', readByCompanyAt: null, intent: { companyId } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.intentId, row._count._all]));
}

/** Unread payer messages per payment, all companies (payments without any are absent). */
export async function unreadForAdmin(): Promise<Map<string, number>> {
  const rows = await db.paymentMessage.groupBy({
    by: ['intentId'],
    where: { author: 'COMPANY', readByAdminAt: null },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.intentId, row._count._all]));
}

/** Rate rules of one side on one payment: a day cap and a minimum gap. Returns the French refusal or null. */
async function floodRefusal(intentId: string, author: ChatSide, now: Date): Promise<string | null> {
  const today = await db.paymentMessage.count({ where: { intentId, author, createdAt: { gte: new Date(now.getTime() - DAY_MS) } } });
  if (today >= MAX_MESSAGES_PER_DAY) return `Limite atteinte : ${MAX_MESSAGES_PER_DAY} messages par jour sur ce paiement.`;
  const last = await db.paymentMessage.findFirst({ where: { intentId, author }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  if (last && now.getTime() - last.createdAt.getTime() < MIN_MESSAGE_GAP_MS) return 'Patientez quelques secondes avant d’envoyer un autre message.';
  return null;
}

/**
 * True when none of this side's messages is waiting unread on the other side: then a notice is
 * worth an email. Computed before the new message is stored, so a burst sends one email.
 */
async function shouldNotify(intentId: string, author: ChatSide): Promise<boolean> {
  const waiting = await db.paymentMessage.count({
    where: author === 'COMPANY' ? { intentId, author, readByAdminAt: null } : { intentId, author, readByCompanyAt: null },
  });
  return waiting === 0;
}

const money = (value: number): string => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;

/** Best effort: never fails the action, and never carries the message text (only that there is one). */
async function notifyAdmin(intent: { id: string; amountTnd: { toString(): string }; company: { name: string } }): Promise<void> {
  try {
    const to = adminEmailAddress();
    if (!to) return;
    await sendEmail({
      to,
      subject: `Nouveau message sur un paiement : ${intent.company.name}`,
      text: `${intent.company.name} a écrit un message sur son paiement de ${money(Number(intent.amountTnd))}.`,
      action: { label: 'Lire le message', url: appUrl(`/admin/paiements/${intent.id}`) },
    });
  } catch (error) {
    console.error('payment chat: admin notice failed', error);
  }
}

async function notifyCompany(intent: { id: string; companyId: string; amountTnd: { toString(): string } }): Promise<void> {
  try {
    const owners = await db.companyUser.findMany({ where: { companyId: intent.companyId, role: 'OWNER', disabledAt: null }, select: { email: true } });
    if (owners.length === 0) return;
    await sendEmail({
      to: owners.map((owner) => owner.email),
      subject: 'SolarixPro vous a écrit à propos de votre paiement',
      text: `SolarixPro a écrit un message sur votre paiement de ${money(Number(intent.amountTnd))}. Connectez-vous pour le lire et répondre.`,
      action: { label: 'Lire le message', url: appUrl(`/paiement/${intent.id}`) },
    });
  } catch (error) {
    console.error('payment chat: company notice failed', error);
  }
}

/**
 * A message from the payer. Only the company's owner writes, never a support session; any other
 * company gets the same "not found" as a payment that does not exist.
 */
export async function postCompanyMessage(
  user: { companyId: string; fullName: string; role: 'OWNER' | 'MEMBER'; impersonatedBySuperAdminId?: string | null },
  intentId: string,
  rawBody: unknown,
  now: Date = new Date(),
): Promise<ChatResult> {
  const intent = await db.paymentIntent.findFirst({
    where: { id: intentId, companyId: user.companyId },
    select: { id: true, companyId: true, status: true, paidAt: true, amountTnd: true, company: { select: { name: true } } },
  });
  if (!intent) return NOT_FOUND;
  const refusal = payerRefusal(user);
  if (refusal) return { ok: false, error: refusal };
  if (!chatOpen(intent, now)) return { ok: false, error: CHAT_CLOSED_MESSAGE };
  const body = readMessageBody(rawBody);
  if (!body.ok) return body;
  const flood = await floodRefusal(intent.id, 'COMPANY', now);
  if (flood) return { ok: false, error: flood };

  const notify = await shouldNotify(intent.id, 'COMPANY');
  await db.paymentMessage.create({ data: { intentId: intent.id, author: 'COMPANY', authorName: user.fullName, body: body.body, createdAt: now } });
  if (notify) await notifyAdmin(intent);
  return { ok: true };
}

/** A message from the admin, shown to the payer as "SolarixPro". */
export async function postAdminMessage(intentId: string, rawBody: unknown, now: Date = new Date()): Promise<ChatResult> {
  const intent = await db.paymentIntent.findUnique({ where: { id: intentId }, select: { id: true, companyId: true, status: true, paidAt: true, amountTnd: true } });
  if (!intent) return NOT_FOUND;
  if (!chatOpen(intent, now)) return { ok: false, error: CHAT_CLOSED_MESSAGE };
  const body = readMessageBody(rawBody);
  if (!body.ok) return body;
  const flood = await floodRefusal(intent.id, 'ADMIN', now);
  if (flood) return { ok: false, error: flood };

  const notify = await shouldNotify(intent.id, 'ADMIN');
  await db.paymentMessage.create({ data: { intentId: intent.id, author: 'ADMIN', authorName: ADMIN_DISPLAY_NAME, body: body.body, createdAt: now } });
  if (notify) await notifyCompany(intent);
  return { ok: true };
}
