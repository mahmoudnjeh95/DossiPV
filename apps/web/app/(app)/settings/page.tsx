import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import { loadEffectiveSubscription } from '../../../lib/sponsorship';
import { summarizeSubscription, quotaJobs, quotaWindowStart, projectsCountedThisMonth } from '../../../lib/subscription';
import { ANME_AGREEMENT_REQUIRED_MESSAGE, TIER_LABELS } from '../../../lib/labels';
import { isAwaitingEmailConfirmation } from '../../../lib/email-confirmation';
import { FlashBanner } from '../../../components/flash-banner';
import { SubscriptionBanner } from '../../../components/subscription-banner';
import { CompanyForm } from './company-form';
import { AcceptInvitationButton } from './pending-invitations';
import { loadSponsor } from '../../../lib/sponsor-info';
import { PAYMENT_METHOD_LABELS } from '../../../lib/payments/p2p';
import Link from 'next/link';

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }): Promise<React.JSX.Element> {
  const { saved } = await searchParams;
  const user = await requireAuthenticatedCompanyUser();
  const company = await db.company.findUnique({
    where: { id: user.companyId },
    include: { payments: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!company) {
    notFound();
  }
  const now = new Date();
  // Sponsoring: who pays for this installer, or the invitations it can still accept.
  const sponsor = await loadSponsor(user.companyId);
  const pendingInvitations = sponsor
    ? []
    : await db.supplierInvitation.findMany({
        where: {
          acceptedAt: null,
          expiresAt: { gt: now },
          email: { in: (await db.companyUser.findMany({ where: { companyId: user.companyId }, select: { email: true } })).map((u) => u.email.toLowerCase()) },
        },
        include: { supplierCompany: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
  const subscription = summarizeSubscription(await loadEffectiveSubscription(user.companyId), now);
  const awaitingEmail = subscription === null && (await isAwaitingEmailConfirmation(user.id));
  // Only the trial's banner shows a dossier count.
  const trialUsed = subscription?.isTrial
    ? projectsCountedThisMonth(await quotaJobs(user.companyId, subscription, now), now, quotaWindowStart(subscription, now)).size
    : 0;

  return (
    <main>
      <h1>Paramètres</h1>
      {saved && <FlashBanner param="saved">Informations enregistrées.</FlashBanner>}
      {company.anmeCertificateFileId === null && <div className="banner banner-danger">{ANME_AGREEMENT_REQUIRED_MESSAGE}</div>}
      <SubscriptionBanner subscription={subscription} trialUsed={trialUsed} awaitingEmailConfirmation={awaitingEmail} />

      <section className="card">
        <h2>Abonnement</h2>
        {subscription ? (
          <dl className="dl">
            <dt>Offre</dt>
            <dd>
              {subscription.planName} ({TIER_LABELS[subscription.tier]}) — {subscription.monthlyDossierLimit} dossiers{subscription.isTrial ? ' pendant l\'essai' : ' / mois'}
            </dd>
            <dt>Statut</dt>
            <dd>{subscription.effectiveStatus === 'ACTIVE' ? 'Actif' : subscription.effectiveStatus === 'EXPIRED' ? 'Expiré' : 'Suspendu'}</dd>
            <dt>Fin de période</dt>
            <dd>{subscription.periodEnd.toLocaleDateString('fr-FR')}</dd>
            <dt>Compte de connexion</dt>
            <dd>{user.email}</dd>
          </dl>
        ) : (
          <p className="muted">
            {awaitingEmail ? 'Votre essai gratuit démarrera dès que votre adresse e-mail sera confirmée.' : 'Aucun abonnement.'}
          </p>
        )}
        <p className="hint">
          Renouvelez ou changez d&apos;offre depuis la page <Link href="/facturation">Abonnement et paiement</Link>. Le changement
          d&apos;email ou de mot de passe se fait auprès de SolarixPro.
        </p>
        {company.payments.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Méthode</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {company.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.createdAt.toLocaleDateString('fr-FR')}</td>
                    <td>{Number(p.amountTnd).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} TND</td>
                    <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                    <td>{p.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(sponsor || pendingInvitations.length > 0) && (
        <section className="card">
          <h2>Parrainage</h2>
          {sponsor ? (
            <p>Vous êtes parrainé par {sponsor.name} : vos panneaux et onduleurs sont ceux de ce fournisseur.</p>
          ) : (
            <ul>
              {pendingInvitations.map((invitation) => (
                <li key={invitation.id}>
                  {invitation.supplierCompany.name} vous invite à utiliser SolarixPro.
                  <AcceptInvitationButton invitationId={invitation.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <CompanyForm
        company={{
          name: company.name,
          shortName: company.shortName,
          slogan: company.slogan,
          address: company.address,
          phone: company.phone,
          email: company.email,
          taxId: company.taxId,
          commercialRegister: company.commercialRegister,
          legalRepFullName: company.legalRepFullName,
          legalRepRole: company.legalRepRole,
          anmeCode: company.anmeCode,
          anmeReference: company.anmeReference,
          anmeCategory: company.anmeCategory,
          // The sign-up placeholder dates are shown empty so the installer has to enter the real ones.
          anmeValidFrom: company.profileComplete ? toDateInput(company.anmeValidFrom) : '',
          anmeValidTo: company.profileComplete ? toDateInput(company.anmeValidTo) : '',
          defaultTMinC: company.defaultTMinC,
          defaultTMaxC: company.defaultTMaxC,
          defaultMaxVoltageDropPct: company.defaultMaxVoltageDropPct,
          defaultMaxAcVoltageDropPct: company.defaultMaxAcVoltageDropPct,
          defaultEarthResistanceTargetOhm: company.defaultEarthResistanceTargetOhm,
          defaultDesignWindSpeedKmh: company.defaultDesignWindSpeedKmh,
          defaultCosPhi: company.defaultCosPhi,
          dossierPrefix: company.dossierPrefix,
          dossierNextNumber: company.dossierCounter + 1,
          hasLogo: company.logoFileId !== null,
          hasAnmeCertificate: company.anmeCertificateFileId !== null,
        }}
      />
    </main>
  );
}
