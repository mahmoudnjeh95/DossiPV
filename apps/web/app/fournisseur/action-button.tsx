'use client';

import { useActionState } from 'react';

/** A one-click server action (add, remove, cancel…) with an optional confirmation and its error. */
export function ActionButton({
  action,
  label,
  confirmMessage,
  secondary,
  disabled,
}: {
  action: () => Promise<{ error: string } | undefined>;
  label: string;
  confirmMessage?: string;
  secondary?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<{ error: string } | undefined>(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <button type="submit" className={secondary ? 'secondary small' : 'small'} disabled={pending || disabled}>
        {label}
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
