'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Last-resort boundary for errors in the root layout. It replaces the whole document (no global
 * styles reach it), hence the inline styles. Rendering errors caught here never reach
 * window.onerror, so they are sent to Sentry explicitly (a no-op when the browser SDK is off).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}): React.JSX.Element {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f4f7f9', color: '#0f172a' }}>
        <main style={{ maxWidth: 480, margin: '15vh auto', padding: '0 16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22 }}>Une erreur inattendue est survenue</h1>
          <p style={{ color: '#526174' }}>Réessayez dans un instant. Si le problème persiste, contactez le support SolarixPro.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ padding: '10px 18px', border: 0, borderRadius: 8, background: '#0f172a', color: '#fff', cursor: 'pointer' }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
