import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/monitoring';

// NEXT_PUBLIC_SENTRY_DSN is inlined at build time (Docker build arg), so the browser SDK is only
// started in images built with it.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init(sentryOptions(dsn));
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
