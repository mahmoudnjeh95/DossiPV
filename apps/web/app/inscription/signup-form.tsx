'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { signUpAction } from './actions';
import { GOVERNORATES } from './governorates';
import { PublicShell } from './public-shell';
import { DevVerifyLink, ResendVerificationForm } from './resend-form';
import {
  AuthBackLink,
  AuthError,
  AuthFieldHint,
  AuthForm,
  AuthHelp,
  AuthInlineLink,
  AuthIntro,
  AuthNotice,
  AuthSubmit,
} from '@/components/auth/auth-ui';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Password rules mirror @dossipv/auth (MIN_PASSWORD_LENGTH); importing it here would pull the
// database client into the browser bundle, and the server action checks them anyway.
const MIN_PASSWORD_LENGTH = 10;

export function SignUpForm({ supplierContact }: { supplierContact: ReactNode }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(signUpAction, undefined);
  const fields = state && !state.sent ? state.fields : undefined;

  if (state?.sent) {
    return (
      <PublicShell titleId="signup-title" eyebrow="INSCRIPTION">
        <h2 id="signup-title">Vérifiez votre boîte mail.</h2>
        <AuthNotice>
          Nous venons d’envoyer un email à {state.email} : ouvrez-le pour confirmer votre adresse
          (lien valable 48 heures). Pensez à vérifier vos courriers indésirables.
        </AuthNotice>
        <DevVerifyLink url={state.devVerifyUrl} />
        <AuthIntro>Vous n’avez rien reçu ? Demandez un nouvel email.</AuthIntro>
        <ResendVerificationForm defaultEmail={state.email} />
        <AuthBackLink href="/login">Retour à la connexion</AuthBackLink>
      </PublicShell>
    );
  }

  return (
    <PublicShell titleId="signup-title" eyebrow="INSCRIPTION">
      <h2 id="signup-title">Créez votre compte.</h2>
      <AuthIntro>Essai gratuit : 3 dossiers pendant 30 jours, sans carte bancaire.</AuthIntro>
      <AuthForm action={formAction} noValidate>
        {state && !state.sent && <SignUpError message={state.error} />}
        <Label htmlFor="companyName">
          Raison sociale
          <Input
            id="companyName"
            name="companyName"
            autoComplete="organization"
            maxLength={200}
            defaultValue={fields?.companyName}
            required
          />
        </Label>
        <Label htmlFor="contactName">
          Nom et prénom du contact
          <Input
            id="contactName"
            name="contactName"
            autoComplete="name"
            maxLength={200}
            defaultValue={fields?.contactName}
            required
          />
        </Label>
        <Label htmlFor="phone">
          Téléphone
          <Input
            id="phone"
            type="tel"
            name="phone"
            autoComplete="tel"
            maxLength={30}
            placeholder="ex. 98 123 456"
            defaultValue={fields?.phone}
          />
        </Label>
        <AuthFieldHint>8 chiffres, avec ou sans +216.</AuthFieldHint>
        <Label htmlFor="email">
          Adresse e-mail
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            maxLength={200}
            defaultValue={fields?.email}
            required
          />
        </Label>
        <Label htmlFor="governorate">
          Gouvernorat
          <Select
            id="governorate"
            name="governorate"
            defaultValue={fields?.governorate ?? ''}
            required
          >
            <option value="" disabled>
              Choisir…
            </option>
            {GOVERNORATES.map((governorate) => (
              <option key={governorate} value={governorate}>
                {governorate}
              </option>
            ))}
          </Select>
        </Label>
        <Label htmlFor="anmeCode">
          Code ANME de l’installateur
          <Input
            id="anmeCode"
            name="anmeCode"
            maxLength={40}
            aria-describedby="anmeCode-help"
            defaultValue={fields?.anmeCode}
          />
        </Label>
        <AuthFieldHint id="anmeCode-help">
          Le numéro d’agrément ANME de votre société d’installation, indiqué sur votre attestation
          d’installateur agréé. Il sert à identifier votre société et figure sur vos dossiers.
        </AuthFieldHint>
        <Label htmlFor="password">
          Mot de passe
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={72}
            required
          />
        </Label>
        <Label htmlFor="confirmation">
          Confirmation du mot de passe
          <Input
            id="confirmation"
            type="password"
            name="confirmation"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={72}
            required
          />
        </Label>
        <AuthFieldHint>{MIN_PASSWORD_LENGTH} caractères minimum.</AuthFieldHint>
        <AuthSubmit pending={pending} label="Créer mon compte" pendingLabel="Création en cours…" />
      </AuthForm>
      <AuthHelp>
        Vous êtes fournisseur ? Ce formulaire est réservé aux installateurs : contactez SolarixPro
        {supplierContact ? <> : {supplierContact}</> : ' pour créer votre espace'}.
      </AuthHelp>
      <AuthHelp>
        Déjà un compte ? <AuthInlineLink href="/login">Se connecter</AuthInlineLink>
      </AuthHelp>
    </PublicShell>
  );
}

/** At the top of the form, scrolled into view: the form is long and the button is far below. */
function SignUpError({ message }: { message: string }): React.JSX.Element {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [message]);
  return <AuthError ref={ref}>{message}</AuthError>;
}
