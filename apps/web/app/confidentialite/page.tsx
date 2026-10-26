import type { Metadata } from 'next';
import { LegalPage, LegalValue, formatTermsDate } from '../../components/legal-page';
import { SUBPROCESSORS, TERMS_VERSION } from '../../lib/legal';
import { getLegalEntity } from '../../lib/platform-settings';
import { supportContact } from '../../lib/support-contact';

export const metadata: Metadata = { title: 'Politique de confidentialité — SolarixPro' };

// The contact address and the publisher are read at request time: never prerendered.
export const dynamic = 'force-dynamic';

export default async function PrivacyPage(): Promise<React.JSX.Element> {
  const entity = await getLegalEntity();
  const email = supportContact().email;
  const contact = email ? <a href={`mailto:${email}`}>{email}</a> : <LegalValue value={null} />;
  return (
    <LegalPage title="Politique de confidentialité" updated={formatTermsDate(TERMS_VERSION)}>
      <p>
        Cette politique explique quelles données personnelles SolarixPro traite, pourquoi, avec qui elles sont partagées, combien
        de temps elles sont gardées et comment exercer vos droits, conformément à la loi organique n° 2004-63 du 27 juillet 2004
        portant sur la protection des données à caractère personnel.
      </p>

      <h2>1. Qui est responsable</h2>
      <p>
        <LegalValue value={entity.name} />, <LegalValue value={entity.address} /> (l’« Éditeur »), est responsable
        du traitement des données des comptes : utilisateurs des entreprises d’installation et des fournisseurs. Déclaration
        auprès de l’Instance Nationale de Protection des Données Personnelles (INPDP) : <LegalValue value={entity.inpdpDeclaration} />.
      </p>
      <p>
        Pour les données des clients de l’installateur (particuliers ou entreprises qui font installer des panneaux), le
        responsable est l’installateur qui les enregistre. L’Éditeur les traite uniquement pour son compte, afin de produire ses
        dossiers, et ne les utilise à aucune autre fin.
      </p>

      <h2>2. Données traitées</h2>
      <h3>Comptes</h3>
      <ul>
        <li>Société : raison sociale, adresse, téléphone, e-mail, représentant légal, agrément ANME, matricule fiscal, logo.</li>
        <li>Utilisateurs : nom, adresse e-mail, mot de passe (stocké sous forme chiffrée, jamais en clair), date d’acceptation des conditions.</li>
        <li>Paiements : montant, date, référence et capture d’écran de la preuve de paiement.</li>
        <li>Données techniques : sessions de connexion et journal des actions d’administration.</li>
      </ul>
      <h3>Clients de l’installateur</h3>
      <ul>
        <li>Identité : nom, prénom, numéro et copie de la CIN.</li>
        <li>Coordonnées : adresse du site, coordonnées GPS, téléphone.</li>
        <li>Facture et contrat STEG : référence client, consommation, puissance souscrite.</li>
        <li>Données du projet : toiture, matériel, plans et dossier généré.</li>
      </ul>

      <h2>3. Pourquoi</h2>
      <ul>
        <li>Fournir le Service : créer les comptes, préparer et générer les dossiers (exécution du contrat).</li>
        <li>Gérer les abonnements, les paiements et la facturation (exécution du contrat, obligations comptables).</li>
        <li>Envoyer les e-mails du Service : confirmation d’adresse, mot de passe oublié, invitation, fin d’abonnement.</li>
        <li>Assurer la sécurité et corriger les erreurs techniques (intérêt légitime).</li>
      </ul>
      <p>Aucune donnée n’est vendue, ni utilisée pour de la publicité ou du profilage.</p>

      <h2>4. Avec qui elles sont partagées</h2>
      <p>
        Les données sont hébergées par <LegalValue value={entity.host} />. Certaines étapes du Service font appel aux
        prestataires suivants, qui ne reçoivent que les données nécessaires à leur tâche :
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Prestataire</th>
            <th scope="col">Usage</th>
            <th scope="col">Pays</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((processor) => (
            <tr key={processor.name}>
              <td>{processor.name}</td>
              <td>{processor.purpose}</td>
              <td>{processor.country}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Plusieurs de ces prestataires sont situés hors de Tunisie. Ces transferts sont limités au strict nécessaire et réalisés
        dans le respect des articles 50 et suivants de la loi organique n° 2004-63. Les services d’intelligence artificielle sont
        utilisés via leur API professionnelle, dont les données ne servent pas à entraîner leurs modèles.
      </p>
      <p>
        Un fournisseur qui parraine un installateur ne voit que des statistiques agrégées (nombre de dossiers, produits
        utilisés), jamais les données des clients de l’installateur.
      </p>

      <h2>5. Durée de conservation</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Données</th>
            <th scope="col">Durée</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Compte et projets, dont les données des clients de l’installateur</td>
            <td>Pendant toute la durée du compte, puis suppression dans les 3 mois suivant sa fermeture. L’installateur peut demander à tout moment la suppression d’un projet.</td>
          </tr>
          <tr>
            <td>Capture d’écran d’une preuve de paiement</td>
            <td>1 mois après la déclaration du paiement, puis effacement automatique.</td>
          </tr>
          <tr>
            <td>Paiements et factures</td>
            <td>10 ans, durée légale de conservation des documents comptables.</td>
          </tr>
          <tr>
            <td>Sauvegardes</td>
            <td>3 jours sur le serveur ; hors du serveur, en copie chiffrée, 30 jours pour les sauvegardes quotidiennes et 12 semaines pour les hebdomadaires.</td>
          </tr>
        </tbody>
      </table>

      <h2>6. Sécurité</h2>
      <p>
        Les échanges avec le Service sont chiffrés (HTTPS). Les mots de passe sont stockés sous forme de hachage. L’accès aux
        données est limité aux utilisateurs de la société concernée et, pour le support, à l’administrateur de l’Éditeur, dont
        les accès sont journalisés. Les sauvegardes conservées hors du serveur sont chiffrées.
      </p>

      <h2>7. Vos droits</h2>
      <p>
        Vous pouvez accéder à vos données, les faire rectifier ou supprimer, et vous opposer à leur traitement pour un motif
        légitime, en écrivant à {contact}. Une réponse vous est apportée dans un délai d’un mois. Un client de l’installateur
        adresse sa demande à l’installateur ; s’il l’adresse à l’Éditeur, celui-ci la transmet à l’installateur. Vous pouvez
        également saisir l’INPDP (<a href="https://www.inpdp.tn" rel="noopener noreferrer" target="_blank">www.inpdp.tn</a>).
      </p>

      <h2>8. Cookies</h2>
      <p>
        Le Service n’utilise qu’un cookie technique, indispensable pour vous garder connecté. Il n’utilise aucun cookie de mesure
        d’audience ni de publicité.
      </p>
    </LegalPage>
  );
}
