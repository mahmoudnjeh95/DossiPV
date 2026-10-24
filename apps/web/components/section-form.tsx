'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useKeepFormValues } from '../lib/keep-form-values';

export interface SectionFormState {
  error: string;
}

export type BoundSectionAction = (prev: SectionFormState | undefined, formData: FormData) => Promise<SectionFormState | undefined>;

/**
 * Client wrapper around a plain `<form>` bound to a Server Action: shows the pending state and
 * the action's French error message (at the top of the form, scrolled into view; the typed values are kept). The fields themselves are rendered by the Server
 * Component parent and passed as children, so each section form stays a simple server-rendered
 * form with default values straight from the database.
 */
export function SectionForm({
  action,
  cancelHref,
  children,
}: {
  action: BoundSectionAction;
  cancelHref: string;
  children: ReactNode;
}): React.JSX.Element {
  const { state, formAction, pending, formRef, errorRef } = useKeepFormValues<SectionFormState>(action);

  return (
    <form ref={formRef} action={formAction} className="card stack">
      {state?.error && <p ref={errorRef} role="alert">{state.error}</p>}
      {children}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <Link href={cancelHref} className="button secondary">
          Retour au projet
        </Link>
      </div>
    </form>
  );
}
