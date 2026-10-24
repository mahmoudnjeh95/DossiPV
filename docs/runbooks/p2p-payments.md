# Paiements P2P (Flouci, izi, D17)

DossiPV n'a ni facturation ni intégration marchand. Flouci, izi et D17 sont utilisés comme de simples **virements de personne à personne** : le client envoie l'argent depuis sa propre application vers le numéro de la plateforme, puis **déclare** le paiement avec une capture d'écran. L'administrateur vérifie la capture et confirme ou refuse.

## Comment ça marche

1. Le client ouvre « Abonnement et paiement » (`/facturation`, ou `/fournisseur/facturation` pour un fournisseur), choisit une offre (renouveler, passer à Premium ou Standard, option 3D pour un installateur parrainé), une durée (1, 3, 6 ou 12 mois) et un moyen de paiement. Le montant est le prix du plan × le nombre de mois (option 3D : prix mensuel × mois), sans TVA ni timbre.
2. Cela crée un paiement « à déclarer » et ouvre la page `/paiement/<id>` : montant, numéro du moyen choisi, nom du titulaire, instructions, et la **référence** à écrire en commentaire du transfert (`DPV-` + 6 caractères).
3. Le client envoie l'argent depuis son application, puis remplit le formulaire : **capture d'écran** (PNG, JPEG ou WebP, 8 Mo au plus) et **numéro d'envoi ou référence du transfert**. Les deux sont obligatoires. Le paiement passe en « En attente de validation par DossiPV ». Il peut renvoyer une nouvelle capture tant que le paiement n'est pas décidé, ou l'annuler.
4. L'administrateur voit le paiement dans **Paiements** (badge = nombre de paiements déclarés en attente), compare la capture au montant, au numéro de destination et à la référence, puis :
   - **Confirmer** : en une seule transaction, le paiement est enregistré (méthode = le moyen choisi, note « Paiement P2P … référence DPV-… ») et l'abonnement est prolongé. Un double clic ne règle qu'une fois.
   - **Refuser** avec un motif obligatoire : le client le lit sur sa page et peut refaire un paiement.
5. Les deux décisions sont dans le journal d'audit (`payment.p2pApprove`, `payment.p2pReject`).

Règles : 3 paiements ouverts (en attente) au plus par société ; seul le responsable (OWNER) du compte peut créer ou déclarer un paiement, jamais une session de support.

Effet d'une confirmation : la période est prolongée à partir de la plus tardive entre la fin actuelle et aujourd'hui ; le plan change s'il diffère ; Premium retire le parrainage d'un installateur parrainé ; un essai gratuit ou la ligne suspendue qui ne portait que l'option 3D démarre une période neuve à partir d'aujourd'hui ; l'option 3D est prolongée de la même façon.

## Renseigner vos numéros

Dans `/admin` → **Paramètres** → **Paiement P2P** :

- **Titulaire du compte** : le nom affiché au client.
- **Numéro Flouci / izi / D17** : chacun est facultatif. Un moyen sans numéro n'est pas proposé ; sans aucun numéro, le client voit « Paiement indisponible : contactez DossiPV ». Chiffres, espaces et « + » uniquement.
- **Instructions** : texte libre affiché sous les numéros.

Le prix de l'option 3D se règle dans la même page. Chaque modification est journalisée (`settings.p2p`).

## Conservation des captures

La capture est ré-encodée en JPEG (1600 px au plus, qualité 80) et stockée dans la base, dans le paiement. Elle est conservée **30 jours** après la déclaration (`proofExpiresAt`). Le worker (`packages/dossier-worker`) l'efface automatiquement : au démarrage puis au plus une fois par heure, il met `proofImage` et `proofMime` à `null` pour les paiements dont `proofExpiresAt` est dépassé et écrit une ligne de journal (`Payment proofs: N screenshot(s) erased.`). Le paiement lui-même reste. Une capture effacée répond 404 : l'écran de l'administrateur indique « Capture supprimée après 30 jours ».

La capture n'est jamais envoyée par email, ni écrite dans le journal d'audit, ni sélectionnée dans les listes : seules deux routes la lisent, `/admin/paiements/<id>/capture` (administrateur) et `/paiement/<id>/capture` (la société qui l'a envoyée), toutes deux en `Cache-Control: private, no-store`.

## Enregistrer un paiement à la main

La fiche d'un installateur garde le formulaire « Enregistrer un paiement » (espèces, virement hors application) : il crée un paiement et peut prolonger l'abonnement, sans passer par une déclaration.
