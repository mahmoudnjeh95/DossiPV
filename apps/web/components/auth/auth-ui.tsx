import type { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '../brand-mark';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';

const STORY = {
  workspace: {
    eyebrow: 'VOTRE ESPACE DE TRAVAIL',
    text: 'Retrouvez vos projets photovoltaïques et poursuivez la préparation de vos dossiers.',
  },
  trial: {
    eyebrow: 'ESSAI GRATUIT',
    text: 'Créez votre compte et préparez vos dossiers photovoltaïques basse tension : 3 dossiers offerts pendant 30 jours.',
  },
  admin: {
    eyebrow: 'ADMINISTRATION',
    text: 'Gérez les installateurs, les fournisseurs, les abonnements et le catalogue d’équipements.',
  },
  invitation: {
    eyebrow: 'INVITATION',
    text: 'Préparez vos dossiers photovoltaïques basse tension avec le matériel de votre fournisseur.',
  },
} as const;

/** The small uppercase label with the gold square. */
export function Eyebrow({
  className,
  children,
  mark,
}: {
  className?: string;
  children: ReactNode;
  mark?: boolean;
}) {
  return (
    <p
      className={cn(
        'mb-5 flex items-center gap-[9px] text-[0.72rem] leading-snug font-extrabold text-app-accent',
        className,
      )}
    >
      {mark && <span className="size-2 flex-none rounded-[2px] bg-[#e8a317]" />}
      {children}
    </p>
  );
}

/**
 * The two-panel look of every public account page (login, sign-up, password reset…): a story
 * panel on the left, the form on the right (stacked on a phone).
 */
export function AuthShell({
  story = 'workspace',
  titleId,
  eyebrow,
  children,
}: {
  story?: keyof typeof STORY;
  titleId: string;
  eyebrow: string;
  children: ReactNode;
}): React.JSX.Element {
  const copy = STORY[story];
  return (
    <main className="m-0 grid min-h-svh w-full max-w-none grid-cols-[minmax(320px,0.9fr)_minmax(440px,1.1fr)] bg-white p-0 max-[700px]:grid-cols-1">
      <section
        aria-label="SolarixPro"
        className="auth-story relative flex min-h-full flex-col justify-between overflow-hidden px-[clamp(32px,6vw,84px)] py-[34px] text-white max-[700px]:min-h-60 max-[700px]:px-[18px] max-[700px]:py-[22px]"
      >
        <Link
          href="/"
          aria-label="Retour à l’accueil SolarixPro"
          className="relative z-1 animate-[sx-fade_0.7s_ease_backwards]"
        >
          <BrandMark inverse className="w-[clamp(170px,18vw,230px)] drop-shadow-[0_6px_22px_rgba(0,0,0,0.35)]" />
        </Link>
        <div className="relative z-1 max-w-[470px] py-[68px] max-[700px]:pt-[33px] max-[700px]:pb-6 *:animate-[sx-rise_0.7s_var(--ease-out)_backwards] *:nth-2:[animation-delay:90ms] *:nth-3:[animation-delay:180ms] *:nth-4:[animation-delay:270ms]">
          <Eyebrow mark className="text-[#ffd25a] max-[700px]:mb-3">
            {copy.eyebrow}
          </Eyebrow>
          <h1 className="m-0 max-w-[420px] text-[3.2rem] leading-[1.12] font-bold tracking-[-0.02em] text-white max-[700px]:max-w-[540px] max-[700px]:text-[2.15rem]">
            Le technique, <span className="text-[#ffc43d]">clairement organisé.</span>
          </h1>
          <p className="mt-5 mb-0 max-w-[390px] text-base leading-[1.75] text-[#c9d6ee] max-[700px]:mt-2.5 max-[700px]:text-[0.9rem]">
            {copy.text}
          </p>
          <div className="mt-[38px] h-[3px] w-[72px] origin-left animate-[sx-grow_0.9s_0.4s_var(--ease-out)_backwards] bg-linear-to-r from-[#ffc43d] to-[#e8a317] max-[700px]:hidden" />
          <span className="mt-2 block text-[0.74rem] text-[#aebddb] max-[700px]:hidden">
            Dossiers photovoltaïques basse tension
          </span>
        </div>
        <span className="relative z-1 flex items-center gap-[9px] text-[0.63rem] font-bold tracking-[0.08em] text-[#aebddb] max-[700px]:hidden">
          SOLARIXPRO <i className="size-1 rounded-full bg-[#e8a317]" /> ESPACE SÉCURISÉ
        </span>
      </section>

      <section
        aria-labelledby={titleId}
        className="grid min-h-full place-items-center bg-[radial-gradient(ellipse_70%_50%_at_100%_0%,rgba(29,75,151,0.07),transparent_70%)] px-8 py-12 max-[700px]:min-h-[calc(100svh-240px)] max-[700px]:place-items-start max-[700px]:px-[18px] max-[700px]:pt-9 max-[700px]:pb-11"
      >
        <div className="w-[min(100%,420px)] animate-[sx-rise_0.7s_0.1s_var(--ease-out)_backwards] [&_h2]:m-0 [&_h2]:text-[2rem] [&_h2]:leading-tight [&_h2]:text-app-navy max-[700px]:[&_h2]:text-[1.8rem]">
          <Eyebrow className="mb-[13px]">{eyebrow}</Eyebrow>
          {children}
        </div>
      </section>
    </main>
  );
}

export function AuthIntro({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p className={cn('mt-[11px] mb-[30px] text-[0.94rem] text-app-muted', className)} {...props} />
  );
}

/** The form column: labels, fields and the submit button share the roomier login sizing. */
export function AuthForm({ className, ...props }: ComponentProps<'form'>) {
  return (
    <form
      className={cn(
        'grid gap-[19px] [&_input]:min-h-[50px] [&_input]:bg-[#fbfcfd] [&_input]:px-3.5 [&_input]:py-3 [&_select]:min-h-[50px] [&_select]:bg-[#fbfcfd] [&_select]:px-3.5 [&_select]:py-3 [&_label]:gap-[7px] [&_label]:text-[0.85rem] [&_label]:font-bold',
        className,
      )}
      {...props}
    />
  );
}

export function AuthFieldHint({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('-mt-2.5 mb-0 text-[0.78rem] text-app-muted', className)} {...props} />;
}

export function AuthError({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      role="alert"
      aria-live="polite"
      className={cn(
        'm-0 border-l-[3px] border-app-danger bg-app-danger-bg px-[13px] py-[11px] text-[0.85rem] text-app-danger',
        className,
      )}
      {...props}
    />
  );
}

export function AuthNotice({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      role="status"
      className={cn(
        'mt-0 mb-[19px] border-l-[3px] border-app-ok bg-app-ok-bg px-[13px] py-[11px] text-[0.85rem] text-app-ok',
        className,
      )}
      {...props}
    />
  );
}

const submitClass =
  'min-h-[50px] justify-between border-app-navy bg-linear-to-b from-[#1d4b97] to-app-navy px-4 py-3 hover:from-[#2459b3] hover:to-[#10296a] [&_span]:transition-transform [&_span]:duration-250 hover:[&_span]:translate-x-1';

/** The wide primary button of the page; its arrow (a span in the label) slides on hover. */
export function AuthSubmit({
  className,
  children,
  pending,
  label,
  pendingLabel,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & {
  children?: never;
  pending: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <Button type="submit" disabled={pending} className={cn(submitClass, className)} {...props}>
      {pending ? pendingLabel : label}
      {!pending && <span aria-hidden="true">→</span>}
    </Button>
  );
}

/** The same look for a link (a call to action that is not a form submit). */
export function authSubmitClass(className?: string): string {
  return cn(buttonVariants(), submitClass, 'flex', className);
}

export function AuthHelp({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('mt-[22px] mb-0 text-[0.78rem] text-app-muted', className)} {...props} />;
}

const linkClass = 'mt-3.5 inline-block text-[0.84rem] font-[650] text-app-accent';

export function AuthLink({ className, href, ...props }: ComponentProps<typeof Link>) {
  return <Link href={href} className={cn(linkClass, className)} {...props} />;
}

export function AuthInlineLink({ className, href, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      href={href}
      className={cn('text-[0.84rem] font-[650] text-app-accent', className)}
      {...props}
    />
  );
}

export function AuthBackLink({
  href = '/',
  children,
}: {
  href?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <Link
      href={href}
      className="mt-[26px] inline-flex min-h-11 items-center gap-2 text-[0.84rem] font-[650] text-slate-700 no-underline hover:text-app-accent"
    >
      <span aria-hidden="true">←</span> {children}
    </Link>
  );
}
