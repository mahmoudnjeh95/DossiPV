import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTunisianPhone } from '../lib/account-form';
import { mailHref, supportContact, telHref, whatsappHref } from '../lib/support-contact';

afterEach(() => vi.unstubAllEnvs());

describe('supportContact', () => {
  it('reads the three env values and falls back to ADMIN_EMAIL for the e-mail', () => {
    vi.stubEnv('SUPPORT_PHONE', ' +216 71 000 000 ');
    vi.stubEnv('SUPPORT_WHATSAPP', '');
    vi.stubEnv('SUPPORT_EMAIL', '');
    vi.stubEnv('ADMIN_EMAIL', 'admin@dossipv.tn');
    expect(supportContact()).toEqual({ phone: '+216 71 000 000', whatsapp: null, email: 'admin@dossipv.tn' });
  });

  it('prefers SUPPORT_EMAIL', () => {
    vi.stubEnv('SUPPORT_EMAIL', 'aide@dossipv.tn');
    vi.stubEnv('ADMIN_EMAIL', 'admin@dossipv.tn');
    expect(supportContact().email).toBe('aide@dossipv.tn');
  });

  it('builds clickable targets', () => {
    expect(telHref('+216 71 000 000')).toBe('tel:+21671000000');
    expect(whatsappHref('98 123 456')).toBe('https://wa.me/21698123456');
    expect(whatsappHref('+216 98 123 456')).toBe('https://wa.me/21698123456');
    expect(mailHref('a@b.tn')).toBe('mailto:a@b.tn');
  });
});

describe('isTunisianPhone', () => {
  it.each(['98123456', '98 123 456', '+216 98 123 456', '00216 98.123.456', '71-123-456'])('accepts %s', (value) => {
    expect(isTunisianPhone(value)).toBe(true);
  });
  it.each(['abc', '1234567', '123456789', '+33 6 12 34 56 78', '98 12x 456', '+216'])('refuses %s', (value) => {
    expect(isTunisianPhone(value)).toBe(false);
  });
});
