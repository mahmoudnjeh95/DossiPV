import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { summarizeSubscription } from '../lib/subscription';
import { SubscriptionBanner } from '../components/subscription-banner';
import { isSponsorLockedLabel, sponsorMissingProductsMessage } from '../lib/sponsor-info';

const NOW = new Date('2026-10-24T10:00:00Z');
const DAY = 24 * 3600 * 1000;

const sponsored = (periodEnd: Date): ReturnType<typeof summarizeSubscription> =>
  summarizeSubscription(
    { status: 'ACTIVE', periodEnd, plan: { name: 'Standard (offert par votre fournisseur)', monthlyDossierLimit: 2, tier: 'STANDARD' }, isTrial: false, sponsored: true },
    NOW,
  );

describe('subscription banner for sponsored installers', () => {
  it('says the supplier subscription lapsed', () => {
    const html = renderToStaticMarkup(<SubscriptionBanner subscription={sponsored(new Date(NOW.getTime() - DAY))} />);
    expect(html).toContain('L’abonnement de votre fournisseur a expiré : payez Standard ou Premium vous-même');
  });

  it('shows nothing while the supplier subscription is comfortably active', () => {
    expect(renderToStaticMarkup(<SubscriptionBanner subscription={sponsored(new Date(NOW.getTime() + 60 * DAY))} />)).toBe('');
  });

  it('offers Standard or Premium to a company with no subscription', () => {
    const html = renderToStaticMarkup(<SubscriptionBanner subscription={null} />);
    expect(html).toContain('Aucun abonnement : contactez DossiPV');
    expect(html).toContain('pour Standard ou Premium');
  });
});

describe('missing products of a sponsor', () => {
  it('names the missing kind', () => {
    expect(sponsorMissingProductsMessage(['Onduleurs monophasés homologués STEG'])).toBe('Votre fournisseur n’a pas encore d’onduleur dans DossiPV.');
    expect(sponsorMissingProductsMessage(['Modules photovoltaïques'])).toBe('Votre fournisseur n’a pas encore de panneau dans DossiPV.');
    expect(sponsorMissingProductsMessage(['Modules photovoltaïques', 'Onduleurs monophasés homologués STEG'])).toBe(
      'Votre fournisseur n’a pas encore d’onduleur ni de panneau dans DossiPV.',
    );
  });

  it('says nothing when only shared kinds are missing', () => {
    expect(sponsorMissingProductsMessage(['Parafoudres DC'])).toBeNull();
    expect(isSponsorLockedLabel('Parafoudres DC')).toBe(false);
    expect(isSponsorLockedLabel('Modules photovoltaïques')).toBe(true);
  });
});
