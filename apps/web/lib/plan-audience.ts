/**
 * Spec 2026-10-23 §3: installer plans go to installers, supplier packs to suppliers. Returns a
 * French refusal when the plan's audience does not match the company's kind, null when it fits.
 */
export function audienceMismatchError(companyKind: 'INSTALLER' | 'SUPPLIER', planAudience: 'INSTALLER' | 'SUPPLIER'): string | null {
  if (companyKind === 'SUPPLIER' && planAudience !== 'SUPPLIER') {
    return 'Un fournisseur ne peut recevoir qu’un pack fournisseur, pas un plan installateur.';
  }
  if (companyKind === 'INSTALLER' && planAudience !== 'INSTALLER') {
    return 'Un installateur ne peut recevoir qu’un plan installateur, pas un pack fournisseur.';
  }
  return null;
}
