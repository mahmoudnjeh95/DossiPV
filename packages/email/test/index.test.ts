import { describe, it, expect, vi, afterEach } from 'vitest';
import nodemailer from 'nodemailer';
import { adminEmailAddress, appUrl, emailHtml, sendEmail, setEmailTransportForTests } from '../src/index';

afterEach(() => {
  setEmailTransportForTests(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sendEmail', () => {
  it('sends text and HTML from the configured sender, with the action link in both', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sendMail = vi.spyOn(transport, 'sendMail');
    setEmailTransportForTests(transport);
    vi.stubEnv('SMTP_FROM', 'SolarixPro <noreply@example.tn>');

    const result = await sendEmail({ to: 'a@b.tn', subject: 'Réinitialisation', text: 'Bonjour,\n\nVoici le lien.', action: { label: 'Choisir un mot de passe', url: 'https://x.tn/r?t=1&u=2' } });

    expect(result).toEqual({ sent: true });
    const mail = sendMail.mock.calls[0]![0] as { from: string; to: string[]; text: string; html: string };
    expect(mail.from).toBe('SolarixPro <noreply@example.tn>');
    expect(mail.to).toEqual(['a@b.tn']);
    expect(mail.text).toContain('Choisir un mot de passe : https://x.tn/r?t=1&u=2');
    expect(mail.html).toContain('href="https://x.tn/r?t=1&amp;u=2"');
  });

  it('logs instead of sending when SMTP is not configured, and never throws', async () => {
    vi.stubEnv('SMTP_HOST', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await sendEmail({ to: 'a@b.tn', subject: 'Test', text: 'Corps' })).toEqual({ sent: false, reason: 'SMTP is not configured' });
    expect(warn).toHaveBeenCalled();
  });

  it('reports a provider failure without throwing', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    vi.spyOn(transport, 'sendMail').mockRejectedValue(new Error('550 rejected'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setEmailTransportForTests(transport);

    expect(await sendEmail({ to: ['a@b.tn'], subject: 'Test', text: 'Corps' })).toEqual({ sent: false, reason: '550 rejected' });
  });
});

describe('email helpers', () => {
  it('escapes the text in the HTML part', () => {
    expect(emailHtml({ text: '<script>x</script>' })).toContain('&lt;script&gt;');
  });

  it('builds absolute links from APP_URL and reads the admin address', () => {
    vi.stubEnv('APP_URL', 'https://dossipv.tn/');
    vi.stubEnv('ADMIN_EMAIL', ' admin@dossipv.tn ');
    expect(appUrl('/login')).toBe('https://dossipv.tn/login');
    expect(adminEmailAddress()).toBe('admin@dossipv.tn');
    vi.stubEnv('ADMIN_EMAIL', '');
    expect(adminEmailAddress()).toBeNull();
  });
});
