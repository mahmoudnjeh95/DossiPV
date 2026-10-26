import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalValue, formatTermsDate } from '../../components/legal-page';
import { LEGAL_ENTITY, TERMS_VERSION } from '../../lib/legal';
import { supportContact } from '../../lib/support-contact';

export const metadata: Metadata = { title: 'Mentions légales — SolarixPro' };

// The contact details come from the environment of the running server: never prerendered.
export const dynamic = 'force-dynamic';

export default function LegalNoticePage(): React.JSX.Element {
  const contact = supportContact();
  return (
    <LegalPage title="Mentions légales" updated={formatTermsDate(TERMS_VERSION)}>
      <h2>Éditeur</h2>
      <table>
        <tbody>
          <tr>
            <th scope="row">Raison sociale</th>
            <td><LegalValue value={LEGAL_ENTITY.name} /></td>
          </tr>
          <tr>
            <th scope="row">Forme juridique</th>
            <td><LegalValue value={LEGAL_ENTITY.legalForm} /></td>
          </tr>
          <tr>
            <th scope="row">Identifiant RNE</th>
            <td><LegalValue value={LEGAL_ENTITY.rneId} /></td>
          </tr>
          <tr>
            <th scope="row">Matricule fiscal</th>
            <td><LegalValue value={LEGAL_ENTITY.taxId} /></td>
          </tr>
          <tr>
            <th scope="row">Siège</th>
            <td><LegalValue value={LEGAL_ENTITY.address} /></td>
          </tr>
          <tr>
            <th scope="row">Directeur de la publication</th>
            <td><LegalValue value={LEGAL_ENTITY.publisher} /></td>
          </tr>
          <tr>
            <th scope="row">Contact</th>
            <td>
              {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <LegalValue value={null} />}
              {contact.phone ? <> · {contact.phone}</> : null}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Hébergement</h2>
      <p><LegalValue value={LEGAL_ENTITY.host} /></p>

      <h2>Données personnelles</h2>
      <p>
        Déclaration INPDP : <LegalValue value={LEGAL_ENTITY.inpdpDeclaration} />. Le détail des traitements figure dans la{' '}
        <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>Marques</h2>
      <p>
        Les noms et logos de la STEG, de l’ANME et des fabricants de matériel cités appartiennent à leurs titulaires. Leur
        mention ne signifie pas que ces organismes ou sociétés approuvent le Service.
      </p>
    </LegalPage>
  );
}
