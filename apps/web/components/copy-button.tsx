'use client';

import { useEffect, useRef, useState } from 'react';

/** Copies text to the clipboard where the browser allows it, with the old selection trick as a fallback (plain http, old phones). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the fallback
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const done = document.execCommand('copy');
    document.body.removeChild(field);
    return done;
  } catch {
    return false;
  }
}

/**
 * A small "Copier" button. `value` is what lands in the clipboard (a number without its spaces, for
 * instance) while the page shows it however it likes; `label` names it for screen readers.
 */
export function CopyButton({ value, label }: { value: string; label: string }): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => (): void => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy(): Promise<void> {
    setState((await copyText(value)) ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2500);
  }

  return (
    <button
      type="button"
      className="small secondary"
      onClick={() => void copy()}
      aria-label={`Copier ${label}`}
      style={{ marginLeft: 8, minHeight: 28, padding: '2px 10px' }}
    >
      {state === 'copied' ? 'Copié ✓' : state === 'failed' ? 'Copie impossible' : 'Copier'}
    </button>
  );
}
