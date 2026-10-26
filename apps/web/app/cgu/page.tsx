import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalValue, formatTermsDate } from '../../components/legal-page';
import { LEGAL_ENTITY, TERMS_VERSION } from '../../lib/legal';
import { supportContact } from '../../lib/support-contact';
import { TRIAL_BILL_IMPORT_LIMIT } from '../../lib/trial';

export const metadata: Metadata = { title: 'Conditions générales — SolarixPro' };

// The contact address comes from the environment of the running server: never prerendered.
export const dynamic = 'force-dynamic';

export default function TermsPage(): React.JSX.Element {
  const email = supportContact().email;
  return (
    <LegalPage title="Conditions générales d’utilisation et de vente" updated={formatTermsDate(TERMS_VERSION)}>
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions régissent l’accès au service en ligne SolarixPro (le « Service »), édité par{' '}
        <LegalValue value={LEGAL_ENTITY.name} /> (l’« Éditeur »), et son utilisation par les entreprises qui s’y inscrivent
        (le « Client »). Le Service aide les installateurs photovoltaïques à préparer le dossier technique d’une installation
        raccordée au réseau basse tension de la STEG : saisie du projet, import de la facture STEG, dimensionnement, contrôles
        électriques, simulation de production, plans, schémas et génération du dossier au format PDF.
      </p>
      <p>
        Le Service est réservé aux professionnels : entreprises d’installation photovoltaïque et fournisseurs de matériel. Il
        n’est pas destiné aux particuliers. En créant un compte ou en cochant la case d’acceptation, le Client accepte les
        présentes conditions sans réserve.
      </p>

      <h2>2. Compte</h2>
      <p>
        Le Client fournit des informations exactes (raison sociale, représentant légal, agrément ANME) et les tient à jour. La
        génération de dossiers n’est possible qu’une fois le profil de la société complété. Chaque utilisateur dispose
        d’identifiants personnels qu’il garde confidentiels ; toute action réalisée avec ces identifiants est réputée faite par
        le Client. Le Client signale sans délai tout usage non autorisé de son compte.
      </p>

      <h2>3. Essai gratuit</h2>
      <p>
        Une entreprise d’installation qui s’inscrit bénéficie d’un essai gratuit de 30 jours, limité à 3 dossiers et à{' '}
        {TRIAL_BILL_IMPORT_LIMIT} imports de facture. À la fin de l’essai, la génération de nouveaux dossiers nécessite un
        abonnement. Un même installateur (code ANME) ne peut bénéficier que d’un essai.
      </p>

      <h2>4. Abonnements, prix et paiement</h2>
      <p>
        Les formules, leur nombre de dossiers par mois et leur prix en dinars tunisiens sont affichés sur la page{' '}
        <Link href="/facturation">Abonnement et paiement</Link> de l’espace Client. Le prix applicable est celui affiché au moment
        de la commande. L’abonnement est payé d’avance pour la durée choisie ; il n’est pas reconduit automatiquement.
      </p>
      <p>
        Le paiement se fait par virement ou transfert vers les coordonnées indiquées sur la page de paiement, accompagné de la
        preuve demandée. L’abonnement est activé ou prolongé après vérification du paiement par l’Éditeur. Une facture est
        délivrée pour chaque paiement validé.
      </p>
      <p>
        Les dossiers non utilisés au cours d’un mois ne sont pas reportés. Une période commencée n’est pas remboursable, sauf
        manquement de l’Éditeur à ses obligations.
      </p>

      <h2>5. Responsabilité du Client sur les dossiers</h2>
      <p>
        Le Service est un outil d’aide à la préparation. <strong>Le Client, installateur agréé, reste seul responsable</strong>{' '}
        du contenu du dossier qu’il signe et dépose : exactitude des données saisies, choix du matériel, conformité de
        l’installation réalisée aux normes et aux exigences de la STEG et de l’ANME. Il vérifie chaque dossier avant de le signer
        et de le déposer.
      </p>
      <p>
        Les calculs reposent sur les données saisies par le Client, sur les caractéristiques publiées par les fabricants et sur
        des services tiers (dont PVGIS pour l’ensoleillement). Certaines étapes, comme la lecture des factures et la rédaction de
        textes, utilisent l’intelligence artificielle : leur résultat peut contenir des erreurs et doit être relu. L’Éditeur ne
        garantit pas l’acceptation d’un dossier par la STEG, l’ANME ou tout autre organisme.
      </p>

      <h2>6. Données des clients de l’installateur</h2>
      <p>
        Pour préparer un dossier, le Client enregistre des données sur ses propres clients (identité, adresse, copie de la CIN,
        facture et contrat STEG). Il garantit les avoir collectées légalement et avoir informé les personnes concernées de leur
        traitement. Pour ces données, l’Éditeur agit pour le compte du Client et selon ses instructions, dans les conditions de
        la <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>7. Fournisseurs et installateurs parrainés</h2>
      <p>
        Un fournisseur peut souscrire un pack de comptes installateurs. Un installateur parrainé utilise le Service dans les
        limites du pack (nombre de dossiers par mois, catalogue limité au matériel du fournisseur). Les produits mis en avant
        par un fournisseur sont signalés comme tels. Le fournisseur n’a accès qu’à des statistiques agrégées, jamais au contenu
        des projets de l’installateur.
      </p>

      <h2>8. Disponibilité du Service</h2>
      <p>
        L’Éditeur met en œuvre des moyens raisonnables pour que le Service soit accessible en permanence, sans garantie de
        disponibilité continue. Il peut l’interrompre pour maintenance, en prévenant si possible les utilisateurs. Les données
        sont sauvegardées chaque nuit.
      </p>

      <h2>9. Propriété intellectuelle</h2>
      <p>
        Le Service, son code, sa présentation et ses modèles de documents appartiennent à l’Éditeur. Le Client reçoit un droit
        d’usage personnel, non exclusif et non cessible pour la durée de son compte. Les dossiers générés appartiennent au
        Client, qui peut les utiliser librement pour ses projets.
      </p>

      <h2>10. Responsabilité de l’Éditeur</h2>
      <p>
        L’Éditeur est tenu d’une obligation de moyens. Sa responsabilité ne peut être engagée que pour un dommage direct
        prouvé, et elle est limitée au montant payé par le Client au cours des douze mois précédant le fait générateur. Il ne
        répond pas des dommages indirects (perte de chiffre d’affaires, refus d’un dossier, retard de chantier).
      </p>

      <h2>11. Suspension et fin du compte</h2>
      <p>
        L’Éditeur peut suspendre un compte en cas de non-paiement, d’usage frauduleux ou contraire aux présentes conditions. Le
        Client peut demander la fermeture de son compte à tout moment{email ? <> à l’adresse <a href={`mailto:${email}`}>{email}</a></> : null}. Après la
        fermeture, ses données sont supprimées dans les délais indiqués dans la politique de confidentialité ; le Client
        télécharge au préalable les dossiers qu’il souhaite garder.
      </p>

      <h2>12. Modification des conditions</h2>
      <p>
        L’Éditeur peut modifier les présentes conditions. Toute nouvelle version est présentée aux utilisateurs, qui doivent
        l’accepter pour continuer à utiliser le Service.
      </p>

      <h2>13. Droit applicable et litiges</h2>
      <p>
        Les présentes conditions sont soumises au droit tunisien. À défaut d’accord amiable, tout litige relève des tribunaux
        compétents de Tunis.
      </p>
    </LegalPage>
  );
}
