import { describe, it, expect } from 'vitest';
import { displayedSubscriptionStatus, maskAccessToken, parseFuturePeriodEnd } from '../lib/admin-period';
import { adminNoticeMessage, withNotice } from '../lib/admin-notice';
import { companySearchWhere, readSearchQuery } from '../lib/admin-search';

const NOW = new Date('2026-10-24T10:00:00Z');

describe('parseFuturePeriodEnd', () => {
  it('accepts a future date and today', () => {
    expect(parseFuturePeriodEnd('2026-12-01', NOW)).toEqual({ date: new Date('2026-12-01') });
    expect(parseFuturePeriodEnd('2026-10-24', NOW)).toEqual({ date: new Date('2026-10-24') });
  });
  it('refuses a past, empty or invalid date with a French message', () => {
    expect(parseFuturePeriodEnd('2026-10-23', NOW)).toEqual({ error: 'Fin de période : la date ne peut pas être dans le passé.' });
    expect(parseFuturePeriodEnd('', NOW)).toEqual({ error: 'Fin de période : date requise.' });
    expect(parseFuturePeriodEnd('abc', NOW)).toEqual({ error: 'Fin de période : date invalide.' });
  });
});

describe('displayedSubscriptionStatus', () => {
  it('shows an active row past its end as expired', () => {
    expect(displayedSubscriptionStatus('ACTIVE', new Date('2026-10-01'), NOW)).toBe('EXPIRED');
    expect(displayedSubscriptionStatus('ACTIVE', new Date('2026-11-01'), NOW)).toBe('ACTIVE');
    expect(displayedSubscriptionStatus('SUSPENDED', new Date('2026-10-01'), NOW)).toBe('SUSPENDED');
  });
});

describe('maskAccessToken', () => {
  it('keeps only the last 4 characters of the token', () => {
    expect(maskAccessToken('https://a.b/{z}?access_token=pk.secret1234')).toBe('https://a.b/{z}?access_token=••••1234');
    expect(maskAccessToken('https://a.b/{z}?access_token=')).toBe('https://a.b/{z}?access_token=(non configuré)');
    expect(maskAccessToken('https://a.b/{z}')).toBe('https://a.b/{z}');
  });
});

describe('admin notices', () => {
  it('only resolves known keys', () => {
    expect(adminNoticeMessage('paymentRecorded')).toBe('Paiement enregistré.');
    expect(adminNoticeMessage('<script>')).toBeNull();
    expect(adminNoticeMessage('toString')).toBeNull();
    expect(adminNoticeMessage(null)).toBeNull();
    expect(withNotice('/admin/plans', 'planSaved')).toBe('/admin/plans?ok=planSaved');
  });
});

describe('list search', () => {
  it('reads and filters the query', () => {
    expect(readSearchQuery('  sol  ')).toBe('sol');
    expect(readSearchQuery(['a', 'b'])).toBe('a');
    expect(readSearchQuery('   ')).toBeNull();
    expect(companySearchWhere(null)).toEqual({});
    expect(companySearchWhere('sol')).toHaveProperty('OR');
  });
});
