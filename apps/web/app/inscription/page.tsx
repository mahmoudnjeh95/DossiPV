import type { Metadata } from 'next';
import { SupportContactLinks } from '../../components/support-contact';
import { supportContact } from '../../lib/support-contact';
import { SignUpForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Essai gratuit — créer un compte installateur',
  description: 'Créez votre compte SolarixPro : 3 dossiers techniques photovoltaïques offerts pendant 30 jours, sans engagement.',
  alternates: { canonical: '/inscription' },
};

// The support contact comes from the environment of the running server: never prerendered.
export const dynamic = 'force-dynamic';

export default function SignUpPage(): React.JSX.Element {
  const contact = supportContact();
  const hasContact = Boolean(contact.phone || contact.whatsapp || contact.email);
  return <SignUpForm supplierContact={hasContact ? <SupportContactLinks /> : null} />;
}
