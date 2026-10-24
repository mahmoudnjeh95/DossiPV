import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { ADMIN_ACTION_LABELS, COMPANY_USER_ROLE_LABELS, SUBSCRIPTION_STATUS_LABELS } from '../../../../../lib/labels';
import { describeAuditDetails } from '../../../../../lib/admin-audit';
import { supplierSeats } from '../../../../../lib/sponsorship';
import { suspendSubscriptionAction, activateSubscriptionAction, updatePeriodEndAction } from '../../installers/[id]/actions';
import { RecordPaymentForm } from '../../installers/[id]/record-payment-form';
import { AddUserForm, AssignPlanForm, ResetPasswordForm } from '../../installers/[id]/account-forms';
import { ChangeEmailForm, UserActionButton } from '../../installers/[id]/user-forms';
import { packLabel } from '../pack-label';
import { unlinkInstallerAction, unhighlightProductAction } from './actions';
import { LinkInstallerForm } from './link-installer-form';

const AUDIT_LOG_ROWS = 30;

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const { id } = await params;

  const [company, packs, unsponsored, seats] = await Promise.all([
    db.company.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        users: { orderBy: { createdAt: 'asc' } },
        sponsoredInstallers: { orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } },
        supplierProducts: {
          orderBy: { createdAt: 'asc' },
          include: { pvModule: { select: { brand: true, model: true } }, inverter: { select: { brand: true, model: true } } },
        },
        adminAuditLogs: { orderBy: { createdAt: 'desc' }, take: AUDIT_LOG_ROWS, include: { superAdmin: { select: { email: true } } } },
      },
    }),
    db.plan.findMany({ where: { audience: 'SUPPLIER' }, orderBy: { priceTnd: 'asc' } }),
    db.company.findMany({ where: { kind: 'INSTALLER', sponsorCompanyId: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    supplierSeats(id),
  ]);

  if (!company) {
    notFound();
  }
  // A company that is not a supplier has its own page (and the shared admin actions come back through it).
  if (company.kind !== 'SUPPLIER') {
    redirect(`/admin/installers/${company.id}`);
  }

  const boundSuspend = suspendSubscriptionAction.bind(null, company.id);
  const boundActivate = activateSubscriptionAction.bind(null, company.id);
  const boundUpdatePeriodEnd = updatePeriodEndAction.bind(null, company.id);
  // Archived packs are no longer offered, except the one the supplier is already on.
  const currentPlanId = company.subscription?.planId ?? null;
  const packOptions = packs
    .filter((pack) => pack.archivedAt === null || pack.id === currentPlanId)
    .map((pack) => ({ id: pack.id, label: packLabel(pack) }));
  const enabledOwnerCount = company.users.filter((user) => user.role === 'OWNER' && user.disabledAt === null).length;

  return (
    <main>
      <h1>{company.name}</h1>
      <section>
        <h2>Informations</h2>
        <p>Contact : {company.legalRepFullName}</p>
        <p>Téléphone : {company.phone}</p>
        <p>Email : {company.email}</p>
      </section>

      <section>
        <h2>Abonnement</h2>
        {company.subscription ? (
          <>
            <p>Pack : {company.subscription.plan.name}</p>
            <p>Statut : {SUBSCRIPTION_STATUS_LABELS[company.subscription.status] ?? company.subscription.status}</p>
            <p>Fin de période : {company.subscription.periodEnd.toLocaleDateString('fr-FR')}</p>
            <p>
              Mise en avant : {company.subscription.plan.includesHighlight ? 'incluse' : 'non incluse'} · Quota :{' '}
              {company.subscription.plan.dossiersPerInstallerPerMonth} dossiers / installateur / mois
            </p>
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
          <p>Aucun pack</p>
        )}
        <AssignPlanForm companyId={company.id} plans={packOptions} currentPlanId={currentPlanId} />
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
        <h2>Installateurs parrainés</h2>
        <p>
          Comptes utilisés : {seats.used} / {seats.max ?? (seats.hasPack ? 'illimité' : '—')}
          {!seats.hasPack && ' (aucun pack : impossible de parrainer)'}
        </p>
        {company.sponsoredInstallers.length === 0 ? (
          <p>Aucun installateur parrainé.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {company.sponsoredInstallers.map((installer) => (
                <tr key={installer.id}>
                  <td>
                    <Link href={`/admin/installers/${installer.id}`}>{installer.name}</Link>
                  </td>
                  <td>{installer.email}</td>
                  <td>
                    <form action={unlinkInstallerAction.bind(null, company.id, installer.id)}>
                      <button type="submit" className="secondary small">
                        Retirer
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>Parrainer un installateur existant</h3>
        {unsponsored.length === 0 ? (
          <p className="hint">Aucun installateur sans parrain.</p>
        ) : (
          <LinkInstallerForm supplierId={company.id} installers={unsponsored} />
        )}
        <p className="hint">
          Retirer un installateur en fait un installateur direct sans plan actif : il garde sa bibliothèque et ses projets, et son compte est libéré.
        </p>
      </section>

      <section>
        <h2>Produits distribués</h2>
        <p>
          Mise en avant : {company.subscription?.plan.includesHighlight ? 'incluse dans le pack' : 'non incluse dans le pack'} ·{' '}
          {company.supplierProducts.filter((product) => product.highlighted).length} produit(s) mis en avant
        </p>
        {company.supplierProducts.length === 0 ? (
          <p>Le fournisseur n&apos;a pas encore choisi de produits.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Marque</th>
                <th>Modèle</th>
                <th>Mis en avant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {company.supplierProducts.map((product) => {
                const item = product.pvModule ?? product.inverter;
                return (
                  <tr key={product.id}>
                    <td>{product.kind === 'PV_MODULE' ? 'Panneau' : 'Onduleur'}</td>
                    <td>{item?.brand ?? '—'}</td>
                    <td>{item?.model ?? '—'}</td>
                    <td>{product.highlighted ? 'oui' : 'non'}</td>
                    <td>
                      {product.highlighted && (
                        <form action={unhighlightProductAction.bind(null, company.id, product.id)}>
                          <button type="submit" className="secondary small">
                            Retirer la mise en avant
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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
                      !lastOwner && <UserActionButton companyId={company.id} userId={user.id} kind="disable" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="hint">
          Réinitialiser un mot de passe ou désactiver un utilisateur le déconnecte de tous ses appareils. Le dernier responsable actif ne peut pas
          être désactivé.
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
