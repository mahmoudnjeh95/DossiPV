import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { summarizeSubscription, checkQuota, projectsCountedThisMonth, quotaWindowStart } from '../lib/subscription';
import { SubscriptionBanner } from '../components/subscription-banner';
import { inactiveSubscriptionMessage, trialQuotaMessage, trialBillImportLimitMessage } from '../lib/trial';

const now = new Date('2026-10-15T12:00:00Z');
const trialPlan = { name: 'Essai gratuit', monthlyDossierLimit: 3, tier: 'STANDARD' as const, isTrial: true };
const normalPlan = { name: 'Standard', monthlyDossierLimit: 3, tier: 'STANDARD' as const, isTrial: false };
const periodStart = new Date('2026-09-20T00:00:00Z');

function trial(overrides: { periodEnd?: Date } = {}): NonNullable<ReturnType<typeof summarizeSubscription>> {
  return summarizeSubscription(
    { status: 'ACTIVE', periodStart, periodEnd: overrides.periodEnd ?? new Date('2026-12-01T00:00:00Z'), plan: trialPlan },
    now,
  )!;
}

const job = (
  projectId: string,
  startedAt: string,
  status: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED',
): { projectId: string; status: 'SUCCEEDED' | 'FAILED'; startedAt: Date } => ({
  projectId,
  status,
  startedAt: new Date(startedAt),
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('trial quota window', () => {
  it('flags the trial and counts from the period start, a regular plan from the month start', () => {
    expect(trial()).toMatchObject({ isTrial: true, periodStart });
    expect(quotaWindowStart(trial(), now)).toEqual(periodStart);
    const normal = summarizeSubscription({ status: 'ACTIVE', periodStart, periodEnd: new Date('2026-12-01'), plan: normalPlan }, now);
    expect(normal?.isTrial).toBe(false);
    // The month starts at midnight in Tunis (UTC+1): 30 September 23:00 UTC for October.
    expect(quotaWindowStart(normal, now)).toEqual(new Date('2026-09-30T23:00:00.000Z'));
    expect(quotaWindowStart(null, now)).toEqual(new Date('2026-09-30T23:00:00.000Z'));
  });

  const jobs = [job('a', '2026-09-25T00:00:00Z'), job('b', '2026-10-02T00:00:00Z'), job('c', '2026-10-05T00:00:00Z')];

  it('a trial counts the dossiers of earlier months, so its 3 dossiers can be used over two months', () => {
    const since = quotaWindowStart(trial(), now);
    expect(projectsCountedThisMonth(jobs, now, since).size).toBe(3);
    expect(checkQuota(jobs, 3, 'd', now, since)).toEqual({ used: 3, limit: 3, blocked: true });
  });

  it('a regular plan ignores the previous month', () => {
    expect(projectsCountedThisMonth(jobs, now).size).toBe(2);
    expect(checkQuota(jobs, 3, 'd', now)).toEqual({ used: 2, limit: 3, blocked: false });
  });

  it('a trial project counts once however often it is regenerated, and failed jobs never count', () => {
    const since = quotaWindowStart(trial(), now);
    const mixed = [job('a', '2026-09-25T00:00:00Z'), job('a', '2026-10-05T00:00:00Z'), job('b', '2026-10-06T00:00:00Z', 'FAILED')];
    expect(checkQuota(mixed, 3, 'a', now, since)).toEqual({ used: 1, limit: 3, blocked: false });
    expect(checkQuota(mixed, 1, 'b', now, since)).toEqual({ used: 1, limit: 1, blocked: true });
  });

  it('an expired trial cannot generate', () => {
    expect(trial({ periodEnd: new Date('2026-10-01T00:00:00Z') })).toMatchObject({ effectiveStatus: 'EXPIRED', canGenerate: false });
  });
});

describe('trial messages', () => {
  it('names the limit and tells to contact SolarixPro', () => {
    vi.stubEnv('ADMIN_EMAIL', '');
    expect(trialQuotaMessage(3)).toBe('Essai gratuit terminé (3 dossiers utilisés) : contactez SolarixPro pour passer à un abonnement.');
    expect(trialBillImportLimitMessage()).toBe(
      "Limite de 10 factures importées pendant l'essai atteinte : contactez SolarixPro pour passer à un abonnement.",
    );
  });

  it('adds the admin address when configured', () => {
    vi.stubEnv('ADMIN_EMAIL', 'contact@dossipv.tn');
    expect(trialQuotaMessage(3)).toContain('contactez SolarixPro (contact@dossipv.tn)');
  });

  it('keeps the usual wording for a non-trial inactive subscription', () => {
    expect(inactiveSubscriptionMessage(null, 'génération')).toBe("Votre abonnement n'est pas actif : génération impossible.");
  });
});

describe('SubscriptionBanner — trial', () => {
  it('shows the dossiers left and the end date while the trial runs', () => {
    const html = renderToStaticMarkup(<SubscriptionBanner subscription={trial()} trialUsed={1} />);
    expect(html).toContain('bg-app-ok-bg');
    expect(html).toContain('Essai gratuit : 2 dossiers restants, jusqu&#x27;au 01/12/2026');
  });

  it('uses the singular for one dossier left and the warning style in the last 7 days', () => {
    const html = renderToStaticMarkup(
      <SubscriptionBanner subscription={trial({ periodEnd: new Date('2026-10-20T00:00:00Z') })} trialUsed={2} />,
    );
    expect(html).toContain('bg-app-warn-bg');
    expect(html).toContain('1 dossier restant,');
    expect(html).toContain('5 jours');
  });

  it('says the trial is over, with the contact details, when the quota is used', () => {
    vi.stubEnv('ADMIN_EMAIL', 'contact@dossipv.tn');
    const html = renderToStaticMarkup(<SubscriptionBanner subscription={trial()} trialUsed={3} />);
    expect(html).toContain('bg-app-danger-bg');
    expect(html).toContain('Essai gratuit terminé (3 dossiers utilisés)');
    expect(html).toContain('plus importer de facture');
    expect(html).toContain('contact@dossipv.tn');
  });

  it('says the trial is over when the period has ended', () => {
    const html = renderToStaticMarkup(
      <SubscriptionBanner subscription={trial({ periodEnd: new Date('2026-10-01T00:00:00Z') })} trialUsed={1} />,
    );
    expect(html).toContain('bg-app-danger-bg');
    expect(html).toContain('Votre essai gratuit');
    expect(html).toContain('plus');
  });

  it('keeps the regular banners for a regular plan', () => {
    const normal = summarizeSubscription({ status: 'ACTIVE', periodEnd: new Date('2026-12-01'), plan: normalPlan }, now);
    expect(renderToStaticMarkup(<SubscriptionBanner subscription={normal} />)).toBe('');
  });
});
