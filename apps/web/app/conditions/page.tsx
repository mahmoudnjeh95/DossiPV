import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../(app)/layout';
import { needsTermsAcceptance } from '../../lib/legal';
import { logoutAction } from '../(app)/actions';
import { AuthIntro, AuthShell } from '@/components/auth/auth-ui';
import { AcceptTermsForm } from './accept-form';
import { NO_INDEX } from '../../lib/site';

// Behind a login or a one-time token: never in search results.
export const metadata: Metadata = { robots: NO_INDEX };

export const dynamic = 'force-dynamic';

/** Where requireCurrentTerms sends a user who has not accepted the current CGU and privacy policy. */
export default async function AcceptTermsPage(): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const [row, company] = await Promise.all([
    db.companyUser.findUnique({ where: { id: user.id }, select: { termsVersion: true } }),
    db.company.findUnique({ where: { id: user.companyId }, select: { kind: true } }),
  ]);
  if (!needsTermsAcceptance(row?.termsVersion)) {
    redirect(company?.kind === 'SUPPLIER' ? '/fournisseur' : '/dashboard');
  }
  const updated = row?.termsVersion != null;
  return (
    <AuthShell titleId="terms-title" eyebrow="CONDITIONS">
      <h2 id="terms-title">{updated ? 'Nos conditions évoluent.' : 'Une dernière étape.'}</h2>
      <AuthIntro>
        {updated
          ? 'Les conditions générales ou la politique de confidentialité ont été mises à jour. Lisez-les et acceptez-les pour continuer à utiliser SolarixPro.'
          : 'Pour utiliser SolarixPro, lisez et acceptez nos conditions générales et notre politique de confidentialité.'}
      </AuthIntro>
      <AcceptTermsForm />
      {/* Not AuthHelp: that is a <p>, and a form cannot sit inside a paragraph. */}
      <form action={logoutAction} className="mt-[22px] text-[0.78rem] text-app-muted">
        Vous ne souhaitez pas les accepter ?{' '}
        <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 font-[650] text-app-accent">
          Se déconnecter
        </button>
      </form>
    </AuthShell>
  );
}
