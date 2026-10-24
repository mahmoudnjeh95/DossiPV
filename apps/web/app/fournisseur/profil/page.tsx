import { db } from '@dossipv/db';
import { requireSupplier } from '../../../lib/supplier-access';
import { ContactDossipv } from '../../../components/support-contact';
import { PasswordForm } from './password-form';

export default async function SupplierProfilePage(): Promise<React.JSX.Element> {
  const { user, supplierId } = await requireSupplier();
  const company = await db.company.findUnique({
    where: { id: supplierId },
    select: { name: true, legalRepFullName: true, email: true, phone: true, address: true },
  });

  return (
    <main>
      <h1>Mon profil</h1>

      <section className="card">
        <h2>Société et contact</h2>
        <dl className="stack">
          <div>
            <dt className="muted">Société</dt>
            <dd>{company?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="muted">Contact</dt>
            <dd>{company?.legalRepFullName || user.fullName}</dd>
          </div>
          <div>
            <dt className="muted">Adresse e-mail de connexion</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt className="muted">Téléphone</dt>
            <dd>{company?.phone || '—'}</dd>
          </div>
          {company?.address ? (
            <div>
              <dt className="muted">Adresse</dt>
              <dd>{company.address}</dd>
            </div>
          ) : null}
        </dl>
        <p className="hint">
          Ces informations ne se modifient pas ici : pour les changer, <ContactDossipv />.
        </p>
      </section>

      <section className="card">
        <h2>Changer mon mot de passe</h2>
        <PasswordForm disabled={Boolean(user.impersonatedBySuperAdminId)} />
      </section>
    </main>
  );
}
