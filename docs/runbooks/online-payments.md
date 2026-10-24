# Paiement en ligne (phase 5)

Research done on 2026-10-24 from public sources only. Spec: `docs/superpowers/specs/2026-10-23-suppliers-sponsoring-and-launch-design.md` §8.

## Résumé

| Fournisseur | API marchand vérifiée ? | État dans l'app |
|---|---|---|
| **Flouci** | Oui, documentation officielle complète | Implémenté, actif quand `FLOUCI_APP_TOKEN` et `FLOUCI_APP_SECRET` sont définis |
| **izi** (Zitouna Payment) | Non : aucune documentation développeur ni API marchand trouvée | Listé « non configuré », jamais appelé |
| **D17** (La Poste Tunisienne) | Non : aucune documentation développeur ni API marchand trouvée | Listé « non configuré », jamais appelé |

Konnect (mentionné dans la spec maître) n'est pas proposé : il reste dans l'enum `PaymentMethod` pour les anciens enregistrements.

## Flouci (vérifié)

Sources (lues le 2026-10-24) :
- Index de la documentation : https://docs.flouci.com/llms.txt
- Créer un paiement : https://docs.flouci.com/api-reference/generate-transaction.md
- Vérifier un paiement : https://docs.flouci.com/api-reference/verify-transaction.md
- Webhooks : https://docs.flouci.com/api-reference/payment-webhooks.md
- Test / sandbox : https://docs.flouci.com/essentials/testing
- Mise en production : https://docs.flouci.com/essentials/production.md
- Création de compte et onboarding : https://docs.flouci.com/getting-started/create-an-account.md

Ce qui est documenté et utilisé par `apps/web/lib/payments/flouci.ts` :
- **Créer** : `POST https://developers.flouci.com/api/v2/generate_payment`, en-tête `Authorization: Bearer <PUBLIC>:<PRIVATE>`. Corps : `amount` (chaîne, en **millimes**), `success_link`, `fail_link`, `webhook`, `webhook_version` (2 = POST JSON signé), `developer_tracking_id` (notre id d'intention), `accept_card`. Réponse : `result.payment_id` et `result.link` (page de paiement).
- **Vérifier** : `GET https://developers.flouci.com/api/v2/verify_payment/{payment_id}`. `result.status` : `SUCCESS` (payé), `PENDING` (session encore payable), `EXPIRED`, `FAILURE`, `SYSTEM_FAILURE`, `PREAUTH_SUCCESS`. Seul `success: true` avec `status: SUCCESS` vaut paiement. La doc déconseille le polling répété (limitation de débit possible).
- **Webhook v2** : POST JSON, en-tête `X-Flouci-Signature: t=<timestamp>,v1=<hex>`, `v1` = HMAC-SHA256 avec le **Private Token** sur `<t>.<corps brut>`. Rejeter les horodatages de plus de quelques minutes. Évènements `payment.succeeded` / `payment.failed`. Flouci attend un 2xx et réessaie 5 fois (1, 2, 4 minutes…) ; le traitement doit être idempotent.
- **Sandbox et production** : même hôte `https://developers.flouci.com`, seules les clés changent. Chaque compte développeur a une « TEST APP » avec ses clés. Cartes de test : Visa 4509 2111 1111 1119 (12/26, CVV 748, succès), MasterCard 5440 2127 1111 1110 (12/26, CVV 665, succès), MasterCard 5471 2511 1111 1116 (échec). En test, `verify_payment` conserve le statut 20 minutes seulement.

Le navigateur n'est jamais cru : la page de retour et le webhook appellent tous deux `settlePaymentIntent`, qui redemande le statut à `verify_payment`. La signature du webhook ne sert qu'à authentifier l'appel.

**Non vérifié / à confirmer par vous**
- **Les frais** : aucune page de la documentation ne les donne. À demander à Flouci (contrat, commission par méthode : portefeuille, carte).
- Les paramètres ajoutés par Flouci aux liens `success_link` / `fail_link` ne sont pas documentés. L'app n'en dépend pas : le lien de retour contient notre id d'intention.
- Les délais d'activation : portefeuille 2 à 4 jours ouvrés, carte 4 à 10 jours ouvrés après la validation KYB (1 à 2 jours ouvrés), d'après la page de mise en production.
- Le code a été écrit contre la documentation et testé avec un `fetch` simulé : aucun appel réel n'a été fait (pas de clés). **Faites un essai de bout en bout avec la TEST APP avant la production.**

### Ouvrir le compte marchand Flouci (pas à pas)

1. Créer un compte sur https://app.flouci.com avec votre numéro de téléphone. Téléverser le RNE : l'accès au sandbox API est immédiat, avant la fin du KYB.
2. Menu utilisateur (en haut à gauche) > « Ajouter un compte de travail » > ouvrir le compte marchand.
3. « Accepter les paiements » dans la bannière « Compléter la liste de vérification » (ou « Accepter en ligne » > « Compléter l'inscription »).
4. Représentant légal : si vous êtes le gérant du RNE, scanner la CIN dans l'application mobile Flouci ; sinon saisir les informations du gérant (CIN, ou passeport + statuts signés et cachetés pour un gérant étranger).
5. Informations de l'activité : téléphone et e-mail publics, chiffre d'affaires annuel estimé, méthode d'acceptation « site web ou application » avec l'adresse publique de DossiPV, description d'au moins 100 caractères.
6. Compte bancaire de règlement : IBAN `TN59` + 24 chiffres, le titulaire doit correspondre exactement au nom de la société ou du gérant (pas besoin d'une banque partenaire).
7. Déclarer les associés de 20 % ou plus et les dirigeants du RNE.
8. Téléverser la patente.
9. Télécharger le contrat généré, le signer et le cacheter à la main, le téléverser, puis soumettre. Surveiller la bannière du tableau de bord (demandes de pièces) et l'e-mail de `noreply@flouci.com`.
10. Après validation : tableau de bord > « Accepter en ligne » > « API » : copier le **Public Token** et le **Private Token** de production.

Variables d'environnement (secrets GitHub du dépôt, comme les SMTP) :

| Variable | Secret GitHub | Rôle |
|---|---|---|
| `FLOUCI_APP_TOKEN` | `DEPLOY_FLOUCI_APP_TOKEN` | Public Token |
| `FLOUCI_APP_SECRET` | `DEPLOY_FLOUCI_APP_SECRET` | Private Token (sert aussi à vérifier la signature des webhooks ; ne jamais l'exposer au navigateur) |
| `FLOUCI_BASE_URL` | `DEPLOY_FLOUCI_BASE_URL` | Facultatif, par défaut `https://developers.flouci.com` |
| `APP_URL` | `DEPLOY_APP_URL` | Obligatoire : adresse publique en https, utilisée pour les liens de retour et le webhook `APP_URL/api/payments/flouci/webhook` |

Commencer avec les clés de la TEST APP, vérifier un paiement de bout en bout (page `/facturation`, carte de test, retour sur `/paiement/retour`), puis remplacer par les clés de production. Le webhook n'a rien à configurer dans le tableau de bord : l'adresse est envoyée à chaque création de paiement.

## izi (non vérifié)

izi est l'application de paiement mobile et de transfert d'argent de Zitouna Payment (lancée en 2022 selon https://www.leconomistemaghrebin.com/2022/03/25/zitouna-payment-devoile-application-paiement-mobile-izi/). Les recherches n'ont trouvé **ni documentation développeur, ni API d'encaissement marchand, ni webhook, ni frais publiés**. Les pages « izi » trouvées par ailleurs (izi.is) n'ont aucun rapport avec la Tunisie. Aucun endpoint n'a donc été deviné : le fournisseur reste « non configuré ».

À faire : contacter Zitouna Payment (izi.tn) et demander (1) s'il existe une API d'encaissement en ligne pour marchands, (2) la documentation de création de paiement, de vérification et de webhook (signature), (3) les frais, (4) la procédure d'ouverture d'un compte marchand. Avec ces éléments, il suffit d'ajouter `lib/payments/izi.ts` (interface `PaymentProvider`), de l'enregistrer dans `lib/payments/registry.ts` et de définir ses variables.

## D17 (non vérifié)

D17 est l'application de La Poste Tunisienne (DigiPostBank D17, compte e-dinar). Une fiche de candidature ITU (https://itu.int/net4/wsis/stocktaking/Prizes/2024/Details/16420145975511582, auto-déclarée) dit que D17 est aussi utilisé pour le e-commerce ; **aucune documentation d'API, de sandbox ni de frais n'est publique** dans ce que nous avons trouvé. La Poste propose par ailleurs une passerelle Mastercard pour le e-commerce (https://kapitalis.com/tunisie/?p=4505475), sans détail technique. Aucun endpoint n'a été deviné : « non configuré ».

À faire : contacter La Poste Tunisienne (service e-commerce / monétique) pour obtenir l'accès marchand et la documentation, comme pour izi ci-dessus.

## Comportement de l'app

- Page de facturation : `/facturation` (installateurs), `/fournisseur/facturation` (fournisseurs). Prix des plans **hors taxes (HT)** (hypothèse documentée dans l'interface) ; TVA (`PlatformSettings.vatRatePct`) et timbre fiscal (`stampDutyTnd`) s'ajoutent.
- Le total TTC est arrondi au centime (Payment et PaymentIntent stockent 2 décimales) ; Flouci reçoit ce montant en millimes.
- Une intention `PENDING` dont la page de retour n'a pas confirmé le paiement reste visible 24 h dans « Paiements en attente » sur la page de facturation, avec un lien « vérifier le paiement » (pas de worker nécessaire). Le webhook sert de filet de sécurité si l'utilisateur ferme son navigateur.
- Admin : le tableau « Dernières tentatives de paiement en ligne » de la fiche installateur montre statut, fournisseur, montant et raison d'échec.
- Développement : `PAYMENTS_FAKE=1` remplace Flouci par une page de simulation (`/paiement/simulation`) sans réseau. Ignoré quand `NODE_ENV=production`.
