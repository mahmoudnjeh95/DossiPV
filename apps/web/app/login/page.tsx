import { SupportContactLinks } from '../../components/support-contact';
import { supportContact } from '../../lib/support-contact';
import { LoginForm } from './login-form';

interface LoginPageProps {
  searchParams: Promise<{ reinitialise?: string | string[]; compte?: string | string[]; connexion?: string | string[] }>;
}

// Depends on the query string and on the support contact of the environment: never prerendered.
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: LoginPageProps): Promise<React.JSX.Element> {
  const query = await searchParams;
  const contact = supportContact();
  const hasContact = Boolean(contact.phone || contact.whatsapp || contact.email);
  return (
    <LoginForm
      // Set by /reinitialiser-mot-de-passe after a successful reset.
      passwordWasReset={query.reinitialise === '1'}
      // Set by /invitation after an installer created its account from a supplier's invitation.
      accountWasCreated={query.compte === 'cree'}
      // Set when a protected page sent an anonymous or expired session here.
      loginRequired={query.connexion === 'requise'}
      supplierContact={hasContact ? <SupportContactLinks /> : null}
    />
  );
}
