import { notFound } from 'next/navigation';
import { db, type Prisma } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { ADMIN_ACTION_LABELS, COMPANY_USER_ROLE_LABELS, SUBSCRIPTION_STATUS_LABELS, TIER_LABELS } from '../../../../../lib/labels';
import { suspendSubscriptionAction, activateSubscriptionAction, updatePeriodEndAction } from './actions';
import { RecordPaymentForm } from './record-payment-form';
import { AddUserForm, AssignPlanForm, ResetPasswordForm } from './account-forms';

const AUDIT_LOG_ROWS = 30;

/** `key : value` pairs of an audit entry's details, for a one-line summary. */
function describeDetails(details: Prisma.JsonValue | null): string {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) {
    return '—';
  }
  return Object.entries(details)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key} : ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(', ');
}

export default async function InstallerDetailPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const { id } = await params;

  const [company, plans] = await Promise.all([
    db.company.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        users: { orderBy: { createdAt: 'asc' } },
        adminAuditLogs: { orderBy: { createdAt: 'desc' }, take: AUDIT_LOG_ROWS, include: { superAdmin: { select: { email: true } } } },
      },
    }),
    db.plan.findMany({ orderBy: { priceTnd: 'asc' } }),
  ]);

  if (!company) {
    notFound();
  }

  const boundSuspend = suspendSubscriptionAction.bind(null, company.id);
  const boundActivate = activateSubscriptionAction.bind(null, company.id);
  const boundUpdatePeriodEnd = updatePeriodEndAction.bind(null, company.id);
  const planOptions = plans.map((plan) => ({
    id: plan.id,
    label: `${plan.name} — ${TIER_LABELS[plan.tier] ?? plan.tier}, ${plan.monthlyDossierLimit} dossiers / mois, ${Number(plan.priceTnd).toFixed(3)} TND`,
  }));

  return (
    <main>
      <h1>{company.name}</h1>
      <section>
        <h2>Informations</h2>
        <p>Adresse : {company.address}</p>
        <p>Téléphone : {company.phone}</p>
        <p>Email : {company.email}</p>
        <p>
          Code ANME : {company.anmeCode} ({company.anmeCategory})
        </p>
      </section>

      <section>
        <h2>Abonnement</h2>
        {company.subscription ? (
          <>
            <p>Plan : {company.subscription.plan.name}</p>
            <p>Statut : {SUBSCRIPTION_STATUS_LABELS[company.subscription.status] ?? company.subscription.status}</p>
            <p>Fin de période : {company.subscription.periodEnd.toLocaleDateString('fr-FR')}</p>
            {company.subscription.status !== 'SUSPENDED' && (
              <form action={boundSuspend}>
                <button type="submit">Suspendre l&apos;abonnement</button>
              </form>
            )}
            {company.subscription.status !== 'ACTIVE' && (
              <form action={boundActivate}>
                <button type="submit">Activer l&apos;abonnement</button>
              </form>
            )}
            <form action={boundUpdatePeriodEnd}>
              <label>
                Nouvelle fin de période
                <input type="date" name="periodEnd" required />
              </label>
              <button type="submit">Mettre à jour</button>
            </form>
          </>
        ) : (
          <p>Aucun abonnement</p>
        )}
        <AssignPlanForm companyId={company.id} plans={planOptions} currentPlanId={company.subscription?.planId ?? null} />
      </section>

      {company.subscription && (
        <section>
          <h2>Enregistrer un paiement</h2>
          <RecordPaymentForm companyId={company.id} />
        </section>
      )}

      <section>
        <h2>Historique des paiements</h2>
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
            {company.payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.createdAt.toLocaleDateString('fr-FR')}</td>
                <td>{payment.amountTnd.toString()} TND</td>
                <td>{payment.method}</td>
                <td>{payment.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Utilisateurs</h2>
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email de connexion</th>
              <th>Rôle</th>
              <th>Créé le</th>
              <th>Mot de passe</th>
            </tr>
          </thead>
          <tbody>
            {company.users.map((user) => (
              <tr key={user.id}>
                <td>{user.fullName}</td>
                <td>{user.email}</td>
                <td>{COMPANY_USER_ROLE_LABELS[user.role] ?? user.role}</td>
                <td>{user.createdAt.toLocaleDateString('fr-FR')}</td>
                <td>
                  <ResetPasswordForm companyId={company.id} userId={user.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Réinitialiser un mot de passe déconnecte cet utilisateur de tous ses appareils.</p>
        <h3>Ajouter un utilisateur</h3>
        <AddUserForm companyId={company.id} />
      </section>

      <section>
        <h2>Historique des actions admin</h2>
        {company.adminAuditLogs.length === 0 ? (
          <p>Aucune action enregistrée.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Par</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {company.adminAuditLogs.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.createdAt.toLocaleString('fr-FR')}</td>
                  <td>{ADMIN_ACTION_LABELS[entry.action] ?? entry.action}</td>
                  <td>{entry.superAdmin.email}</td>
                  <td>{describeDetails(entry.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
