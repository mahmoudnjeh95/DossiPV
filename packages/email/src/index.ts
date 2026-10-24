import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transactional email over SMTP, for any provider (Brevo, Mailgun, OVH, Gmail…): password reset
 * links, expiry reminders, admin alerts. Configured by SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASSWORD and SMTP_FROM. Without SMTP_HOST (local development) nothing is sent: the email
 * is logged instead, so every flow still works end to end.
 */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  /** Plain text; the HTML part is built from it. */
  text: string;
  /** A link the email is about (reset link, renewal page…), shown as a button under the text. */
  action?: { label: string; url: string };
}

export interface SendResult {
  sent: boolean;
  /** Why nothing was sent: SMTP is not configured, or the provider refused. */
  reason?: string;
}

let transporter: Transporter | null = null;
let transporterOverride: Transporter | null = null;

/** Tests swap the SMTP transport for nodemailer's in-memory one; null restores the real one. */
export function setEmailTransportForTests(transport: Transporter | null): void {
  transporterOverride = transport;
}

export function isEmailConfigured(): boolean {
  return transporterOverride !== null || Boolean(process.env.SMTP_HOST);
}

function smtpTransport(): Transporter {
  if (transporterOverride) return transporterOverride;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587); // empty in compose when unset
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Port 465 is SMTPS; any other port starts in clear text and upgrades with STARTTLS.
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
    });
  }
  return transporter;
}

/** The address the platform writes from, e.g. `SolarixPro <noreply@dossipv.tn>`. */
export function senderAddress(): string {
  return process.env.SMTP_FROM ?? 'SolarixPro <noreply@dossipv.tn>';
}

/** Where alerts and sign-up notifications go (the super admin's mailbox); null when unset. */
export function adminEmailAddress(): string | null {
  return process.env.ADMIN_EMAIL?.trim() || null;
}

/** An absolute link into the app, from APP_URL (e.g. `https://dossipv.tn`), for emails. */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The HTML part: the text's paragraphs, then the action as a button, in a plain branded frame. */
export function emailHtml(message: Pick<EmailMessage, 'text' | 'action'>): string {
  const paragraphs = message.text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = message.action
    ? `<p style="margin:20px 0"><a href="${escapeHtml(message.action.url)}" style="display:inline-block;padding:10px 18px;background:#1a4fa0;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(message.action.label)}</a></p>` +
      `<p style="margin:0 0 14px;font-size:12px;color:#666">Si le bouton ne s'ouvre pas : ${escapeHtml(message.action.url)}</p>`
    : '';
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px">' +
    paragraphs +
    button +
    '<p style="margin:24px 0 0;font-size:12px;color:#888">SolarixPro — dossiers techniques photovoltaïques STEG</p></div>'
  );
}

/**
 * Sends one email. Never throws: a failed send is logged and reported in the result, because no
 * flow (a password reset request, a dossier job) should fail because the mail provider did.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  if (recipients.length === 0) return { sent: false, reason: 'no recipient' };
  const text = message.action ? `${message.text}\n\n${message.action.label} : ${message.action.url}` : message.text;
  if (!isEmailConfigured()) {
    // Without SMTP (development) the body is logged so a reset link can be followed by hand; in
    // production it would put live one-time links in the logs, so only the fact is logged.
    const body = process.env.NODE_ENV === 'production' ? '' : `\n${text}`;
    console.warn(`[email not sent: SMTP_HOST is not set] to=${recipients.join(', ')} subject="${message.subject}"${body}`);
    return { sent: false, reason: 'SMTP is not configured' };
  }
  try {
    await smtpTransport().sendMail({ from: senderAddress(), to: recipients, subject: message.subject, text, html: emailHtml(message) });
    return { sent: true };
  } catch (error) {
    console.error(`sendEmail: "${message.subject}" to ${recipients.join(', ')} failed`, error);
    return { sent: false, reason: error instanceof Error ? error.message : 'send failed' };
  }
}
