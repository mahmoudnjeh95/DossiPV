import { db } from '@dossipv/db';
import { requireSupplier } from '../../../lib/supplier-access';
import { ContactDossipv } from '../../../components/support-contact';
import { PasswordForm } from './password-form';
import { Card } from '@/components/ui/card';

export default async function SupplierProfilePage(): Promise<React.JSX.Element> {
  const { user, supplierId } = await requireSupplier();
  const company = await db.company.findUnique({
    where: { id: supplierId },
    select: { name: true, legalRepFullName: true, email: true, phone: true, address: true },
  });

  return (
    <main>
      <h1>Mon profil</h1>

      <Card as="section">
        <h2>Société et contact</h2>
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-app-muted">Société</dt>
            <dd>{company?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-app-muted">Contact</dt>
            <dd>{company?.legalRepFullName || user.fullName}</dd>
          </div>
          <div>
            <dt className="text-app-muted">Adresse e-mail de connexion</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt className="text-app-muted">Téléphone</dt>
            <dd>{company?.phone || '—'}</dd>
          </div>
          {company?.address ? (
            <div>
              <dt className="text-app-muted">Adresse</dt>
              <dd>{company.address}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-[0.8rem] font-normal text-app-muted">
          Ces informations ne se modifient pas ici : pour les changer, <ContactDossipv />.
        </p>
      </Card>

      <Card as="section">
        <h2>Changer mon mot de passe</h2>
        <PasswordForm disabled={Boolean(user.impersonatedBySuperAdminId)} />
      </Card>
    </main>
  );
}
