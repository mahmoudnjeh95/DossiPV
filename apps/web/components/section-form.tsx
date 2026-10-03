'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useActionState } from 'react';

export interface SectionFormState {
  error: string;
}

export type BoundSectionAction = (prev: SectionFormState | undefined, formData: FormData) => Promise<SectionFormState | undefined>;

/**
 * Client wrapper around a plain `<form>` bound to a Server Action: shows the pending state and
 * the action's French error message. The fields themselves are rendered by the Server
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
  const [state, formAction, pending] = useActionState<SectionFormState | undefined, FormData>(action, undefined);

  return (
    <form action={formAction} className="card stack">
      {children}
      {state?.error && <p role="alert">{state.error}</p>}
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
