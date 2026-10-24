/**
 * Success messages shown by the admin after an action. An action redirects to its page with
 * `?ok=<key>` and the banner of the admin layout looks the key up here: the text never travels in
 * the URL, so a crafted link cannot display arbitrary content.
 */
export const ADMIN_NOTICES = {
  subscriptionSuspended: 'Abonnement suspendu.',
  subscriptionActivated: 'Abonnement activé.',
  periodEndUpdated: 'Fin de période mise à jour.',
  planChanged: 'Plan modifié.',
  subscriptionCreated: 'Abonnement créé.',
  paymentRecorded: 'Paiement enregistré.',
  option3dSaved: 'Option 3D enregistrée.',
  option3dCleared: 'Option 3D supprimée.',
  userAdded: 'Utilisateur ajouté.',
  passwordReset: 'Mot de passe réinitialisé.',
  userDisabled: 'Accès de l’utilisateur désactivé.',
  userEnabled: 'Accès de l’utilisateur réactivé.',
  emailChanged: 'Email de connexion modifié.',
  signupContacted: 'Inscription marquée comme contactée.',
  signupUncontacted: 'Inscription remise à contacter.',
  installerCreated: 'Installateur créé.',
  supplierCreated: 'Fournisseur créé.',
  installerLinked: 'Installateur parrainé.',
  installerUnlinked: 'Installateur retiré du parrainage.',
  productUnhighlighted: 'Mise en avant retirée.',
  planSaved: 'Plan enregistré.',
  planArchived: 'Plan archivé.',
  planUnarchived: 'Plan désarchivé.',
  paymentApproved: 'Paiement confirmé.',
  paymentRejected: 'Paiement refusé.',
} as const;

export type AdminNoticeKey = keyof typeof ADMIN_NOTICES;

/** `path` with the success banner key attached. */
export function withNotice(path: string, key: AdminNoticeKey): string {
  return `${path}?ok=${key}`;
}

/** The message for an `ok` query value, or null for an unknown or missing key. */
export function adminNoticeMessage(key: string | null | undefined): string | null {
  return key && Object.prototype.hasOwnProperty.call(ADMIN_NOTICES, key) ? ADMIN_NOTICES[key as AdminNoticeKey] : null;
}
