import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import { summarizeSubscription } from '../../../lib/subscription';
import { TIER_LABELS } from '../../../lib/labels';
import { SubscriptionBanner } from '../../../components/subscription-banner';
import { CompanyForm } from './company-form';

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }): Promise<React.JSX.Element> {
  const { saved } = await searchParams;
  const user = await requireAuthenticatedCompanyUser();
  const company = await db.company.findUnique({
    where: { id: user.companyId },
    include: { subscription: { include: { plan: true } }, payments: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!company) {
    notFound();
  }
  const subscription = summarizeSubscription(company.subscription, new Date());

  return (
    <main>
      <h1>Société</h1>
      {saved && <div className="banner banner-ok">Informations enregistrées.</div>}
      <SubscriptionBanner subscription={subscription} />

      <section className="card">
        <h2>Abonnement</h2>
        {subscription ? (
          <dl className="dl">
            <dt>Offre</dt>
            <dd>
              {subscription.planName} ({TIER_LABELS[subscription.tier]}) — {subscription.monthlyDossierLimit} dossiers / mois
            </dd>
            <dt>Statut</dt>
            <dd>{subscription.effectiveStatus === 'ACTIVE' ? 'Actif' : subscription.effectiveStatus === 'EXPIRED' ? 'Expiré' : 'Suspendu'}</dd>
            <dt>Fin de période</dt>
            <dd>{subscription.periodEnd.toLocaleDateString('fr-FR')}</dd>
            <dt>Compte de connexion</dt>
            <dd>{user.email}</dd>
          </dl>
        ) : (
          <p className="muted">Aucun abonnement.</p>
        )}
        <p className="hint">
          Le renouvellement en ligne (paiement Konnect) arrive prochainement ; en attendant, contactez DossiPV pour prolonger
          votre abonnement. Le changement d&apos;email ou de mot de passe se fait également auprès de DossiPV.
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
                    <td>{p.method === 'KONNECT' ? 'Konnect' : 'Manuel'}</td>
                    <td>{p.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
          anmeValidFrom: toDateInput(company.anmeValidFrom),
          anmeValidTo: toDateInput(company.anmeValidTo),
          defaultTMinC: company.defaultTMinC,
          defaultTMaxC: company.defaultTMaxC,
          defaultMaxVoltageDropPct: company.defaultMaxVoltageDropPct,
          defaultEarthResistanceTargetOhm: company.defaultEarthResistanceTargetOhm,
          defaultDesignWindSpeedKmh: company.defaultDesignWindSpeedKmh,
          defaultCosPhi: company.defaultCosPhi,
          hasLogo: company.logoFileId !== null,
          hasAnmeCertificate: company.anmeCertificateFileId !== null,
        }}
      />
    </main>
  );
}
