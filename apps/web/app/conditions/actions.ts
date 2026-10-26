'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../(app)/layout';
import { TERMS_VERSION } from '../../lib/legal';

export type AcceptTermsState = { error: string } | undefined;

/** Records that the signed-in user accepted the current terms, then opens its space. */
export async function acceptTermsAction(_prevState: AcceptTermsState, formData: FormData): Promise<AcceptTermsState> {
  const user = await requireAuthenticatedCompanyUser();
  if (user.impersonatedBySuperAdminId) {
    return { error: 'En connexion « en tant que », l’acceptation revient à l’utilisateur lui-même.' };
  }
  if (formData.get('acceptTerms') !== 'on') {
    return { error: 'Cochez la case pour accepter les conditions.' };
  }
  await db.companyUser.update({
    where: { id: user.id },
    data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
  });
  const company = await db.company.findUnique({ where: { id: user.companyId }, select: { kind: true } });
  redirect(company?.kind === 'SUPPLIER' ? '/fournisseur' : '/dashboard');
}
