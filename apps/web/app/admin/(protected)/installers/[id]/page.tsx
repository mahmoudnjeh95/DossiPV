import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { ADMIN_ACTION_LABELS, COMPANY_USER_ROLE_LABELS, SUBSCRIPTION_STATUS_LABELS, TIER_LABELS } from '../../../../../lib/labels';
import { suspendSubscriptionAction, activateSubscriptionAction, updatePeriodEndAction } from './actions';
import { RecordPaymentForm } from './record-payment-form';
import { AddUserForm, AssignPlanForm, ResetPasswordForm } from './account-forms';
import { ChangeEmailForm, UserActionButton } from './user-forms';
import { markSignupUncontactedAction } from '../../inscriptions/actions';
import { MarkContactedForm } from '../../inscriptions/signup-forms';
import { describeAuditDetails } from '../../../../../lib/admin-audit';

const AUDIT_LOG_ROWS = 30;

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
  // Archived plans are no longer offered, except the one the company is already on.
  const currentPlanId = company.subscription?.planId ?? null;
  const planOptions = plans
    .filter((plan) => plan.archivedAt === null || plan.id === currentPlanId)
    .map((plan) => ({
      id: plan.id,
      label: `${plan.name} — ${TIER_LABELS[plan.tier] ?? plan.tier}, ${plan.monthlyDossierLimit} dossiers / mois, ${Number(plan.priceTnd).toFixed(3)} TND${plan.isTrial ? ' (essai)' : ''}${plan.archivedAt ? ' (archivé)' : ''}`,
    }));
  const enabledOwnerCount = company.users.filter((user) => user.role === 'OWNER' && user.disabledAt === null).length;

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

      {company.signupAt && (
        <section>
          <h2>Inscription</h2>
          <p>Inscrit le {company.signupAt.toLocaleDateString('fr-FR')}</p>
          <p>Contact : {company.signupContactName ?? '—'}</p>
          <p>Gouvernorat : {company.signupGovernorate ?? '—'}</p>
          <p>Code ANME : {company.anmeCode}</p>
          <p>Profil complété : {company.profileComplete ? 'oui' : 'non'}</p>
          <p>
            Contacté :{' '}
            {company.signupContactedAt ? `oui, le ${company.signupContactedAt.toLocaleDateString('fr-FR')}` : 'non'}
          </p>
          {company.signupNote && <p>Note : {company.signupNote}</p>}
          <MarkContactedForm companyId={company.id} note={company.signupNote} />
          {company.signupContactedAt && (
            <form action={markSignupUncontactedAction.bind(null, company.id)}>
              <button type="submit" className="secondary small">
                Remettre à contacter
              </button>
            </form>
          )}
        </section>
      )}

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
        <AssignPlanForm companyId={company.id} plans={planOptions} currentPlanId={currentPlanId} onTrial={company.subscription?.plan.isTrial ?? false} />
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
              <th>Accès</th>
            </tr>
          </thead>
          <tbody>
            {company.users.map((user) => {
              const disabled = user.disabledAt !== null;
              const lastOwner = !disabled && user.role === 'OWNER' && enabledOwnerCount <= 1;
              return (
                <tr key={user.id} className={disabled ? 'muted' : undefined}>
                  <td>
                    {user.fullName} {disabled && <span className="badge">désactivé</span>}
                  </td>
                  <td>
                    <ChangeEmailForm companyId={company.id} userId={user.id} email={user.email} />
                  </td>
                  <td>{COMPANY_USER_ROLE_LABELS[user.role] ?? user.role}</td>
                  <td>{user.createdAt.toLocaleDateString('fr-FR')}</td>
                  <td>
                    <ResetPasswordForm companyId={company.id} userId={user.id} />
                    {!disabled && <UserActionButton companyId={company.id} userId={user.id} kind="sendResetLink" />}
                  </td>
                  <td>
                    {disabled ? (
                      <UserActionButton companyId={company.id} userId={user.id} kind="enable" />
                    ) : (
                      <>
                        <UserActionButton companyId={company.id} userId={user.id} kind="impersonate" />
                        {!lastOwner && <UserActionButton companyId={company.id} userId={user.id} kind="disable" />}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="hint">
          Réinitialiser un mot de passe ou désactiver un utilisateur le déconnecte de tous ses appareils. Le lien de réinitialisation est
          valable 7 jours. « Se connecter en tant que » ouvre l&apos;application installateur dans ce navigateur pendant 1 heure au plus.
          Le dernier responsable actif ne peut pas être désactivé.
        </p>
        <h3>Ajouter un utilisateur</h3>
        <AddUserForm companyId={company.id} />
      </section>

      <section>
        <h2>Historique des actions admin</h2>
        <p>
          <Link href={`/admin/audit?company=${company.id}`}>Tout l&apos;historique de cette société dans le journal</Link>
        </p>
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
                  <td>{describeAuditDetails(entry.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
