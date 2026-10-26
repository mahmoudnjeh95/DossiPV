import Link from 'next/link';

const LINK = 'font-semibold text-app-accent underline underline-offset-2';

/** The required "I accept" box of the sign-up and of /conditions; the form field is `acceptTerms`. */
export function TermsCheckbox(): React.JSX.Element {
  return (
    <label htmlFor="acceptTerms" className="flex items-start gap-2.5 text-[0.88rem] leading-[1.5] text-app-text">
      <input id="acceptTerms" type="checkbox" name="acceptTerms" required className="mt-[3px] size-4 shrink-0 accent-app-primary" />
      <span>
        J’ai lu et j’accepte les{' '}
        <Link href="/cgu" target="_blank" className={LINK}>
          conditions générales d’utilisation et de vente
        </Link>{' '}
        et la{' '}
        <Link href="/confidentialite" target="_blank" className={LINK}>
          politique de confidentialité
        </Link>
        .
      </span>
    </label>
  );
}
