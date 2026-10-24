import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/monitoring';

/**
 * Server-side error monitoring. Sentry stays completely off until SENTRY_DSN is set on the
 * server (see docs/runbooks/monitoring.md); `@sentry/nextjs` resolves to its Node or edge build
 * per runtime, so one init serves both.
 */
export function register(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryOptions(dsn));
  }
}

// Errors thrown in server components, route handlers and server actions. Without an init it has
// no client to send to, so it is a no-op.
export const onRequestError = Sentry.captureRequestError;
