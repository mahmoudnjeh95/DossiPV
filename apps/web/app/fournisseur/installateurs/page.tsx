import { db } from '@dossipv/db';
import { requireSupplier, dossiersThisMonth } from '../../../lib/supplier-access';
import { supplierSeats } from '../../../lib/sponsorship';
import { ActionButton } from '../action-button';
import { ContactDossipv } from '../../../components/support-contact';
import { ContactDossipv } from '../../../components/support-contact';
import { InviteForm } from './invite-form';
import { cancelInvitationAction, removeSponsoredInstallerAction } from './actions';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' });

export default async function SupplierInstallersPage(): Promise<React.JSX.Element> {
  const { supplierId } = await requireSupplier();
  const [seats, installers, invitations] = await Promise.all([
    supplierSeats(supplierId),
    db.company.findMany({
      where: { sponsorCompanyId: supplierId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, legalRepFullName: true, email: true, phone: true },
    }),
    db.supplierInvitation.findMany({
      where: { supplierCompanyId: supplierId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, expiresAt: true },
    }),
  ]);
  const dossiers = await dossiersThisMonth(installers.map((i) => i.id));
  const full = !seats.hasPack || (seats.max !== null && seats.used >= seats.max);

  return (
    <main>
      <h1>Installateurs</h1>
      <p>
        <strong>{seats.max === null ? `${seats.used} installateurs` : `${seats.used} / ${seats.max} installateurs`}</strong>
        {!seats.hasPack && <span className="muted"> — aucun pack actif : <ContactDossipv />.</span>}
      </p>

      <section className="card">
        <h2>Inviter un installateur</h2>
        <p className="hint">
          Il reçoit un lien valable 7 jours. Une fois l’invitation acceptée, son abonnement Standard est offert par vous et sa bibliothèque
          se limite à vos panneaux et onduleurs.
        </p>
        <InviteForm
          disabled={full}
          disabledReason={
            !seats.hasPack ? (
              <>
                Vous n’avez aucun pack actif, donc aucune place d’invitation : <ContactDossipv /> pour en activer un.
              </>
            ) : full ? (
              <>
                Toutes les places de votre pack sont utilisées ({seats.used} / {seats.max}). Retirez un installateur parrainé ci-dessous pour
                libérer une place, ou <ContactDossipv /> pour un pack plus grand.
              </>
            ) : null
          }
        />
      </section>

      <section className="card table-wrap">
        <h2>Installateurs parrainés ({installers.length})</h2>
        {installers.length === 0 ? (
          <p className="muted">Aucun installateur parrainé pour le moment.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Société</th>
                <th>Contact</th>
                <th>Dossiers ce mois-ci</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {installers.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>
                    {i.legalRepFullName}
                    <br />
                    <span className="muted">
                      {i.email} · {i.phone}
                    </span>
                  </td>
                  <td>{dossiers.get(i.id) ?? 0}</td>
                  <td>
                    <ActionButton
                      action={removeSponsoredInstallerAction.bind(null, i.id)}
                      label="Retirer"
                      secondary
                      confirmMessage={`Retirer ${i.name} ? Cet installateur deviendra un installateur direct et devra payer son propre abonnement.`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card table-wrap">
        <h2>Invitations en attente ({invitations.length})</h2>
        {invitations.length === 0 ? (
          <p className="muted">Aucune invitation en attente.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Adresse e-mail</th>
                <th>Expire le</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td>{dateFormat.format(inv.expiresAt)}</td>
                  <td>
                    <ActionButton action={cancelInvitationAction.bind(null, inv.id)} label="Annuler" secondary />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
