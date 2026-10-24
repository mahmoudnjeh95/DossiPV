import { useActionState, useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * React 19 resets a form once its action has finished, so a server-side validation error would
 * wipe everything the installer typed. This writes the submitted values back into the form's
 * fields (files cannot be restored: the browser forbids it).
 */
export function restoreFormValues(form: HTMLFormElement, submitted: FormData): void {
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
    const name = element.name;
    if (!name) continue;
    const values = submitted.getAll(name).filter((value): value is string => typeof value === 'string');
    if (element instanceof HTMLInputElement) {
      if (element.type === 'file' || element.type === 'submit' || element.type === 'button') continue;
      if (element.type === 'checkbox' || element.type === 'radio') {
        element.checked = values.includes(element.value);
        continue;
      }
    }
    if (element instanceof HTMLSelectElement && element.multiple) {
      for (const option of Array.from(element.options)) option.selected = values.includes(option.value);
      continue;
    }
    if (values.length > 0) element.value = values[0] ?? '';
  }
}

type ErrorState = { error?: string } | null | undefined;

/**
 * `useActionState` plus: when the action answers with an error, the submitted values are put
 * back in the form and the error message (rendered with role="alert" at the top of the form, via
 * `errorRef`) is scrolled into view.
 */
export function useKeepFormValues<State extends ErrorState>(
  action: (previous: State | undefined, formData: FormData) => Promise<State | undefined>,
): {
  state: State | undefined;
  formAction: (formData: FormData) => void;
  pending: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  errorRef: RefObject<HTMLParagraphElement | null>;
} {
  const formRef = useRef<HTMLFormElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const submitted = useRef<FormData | null>(null);
  const wrapped = useCallback(
    async (previous: State | undefined, formData: FormData): Promise<State | undefined> => {
      submitted.current = formData;
      return action(previous, formData);
    },
    [action],
  );
  const [state, formAction, pending] = useActionState<State | undefined, FormData>(wrapped, undefined);

  useEffect(() => {
    if (!state?.error) return;
    if (formRef.current && submitted.current) restoreFormValues(formRef.current, submitted.current);
    errorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [state]);

  return { state, formAction, pending, formRef, errorRef };
}
