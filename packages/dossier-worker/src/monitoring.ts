import * as Sentry from '@sentry/node';

/**
 * Error monitoring for the worker. Off (every call a no-op) until SENTRY_DSN is set. The jobs
 * handle client names, CIN numbers, addresses, phone numbers, STEG references and bill text, so
 * events are scrubbed before leaving and the context passed to `reportError` must be ids only.
 * The web app has its own copy of these rules (apps/web/lib/monitoring.ts): the worker cannot
 * import from the app.
 */

let enabled = false;

const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g;
// CIN, phone numbers and STEG references; dashes excluded so dates stay readable.
const LONG_NUMBER = /(?:\+?216[\s.]?)?\d(?:[\s.]?\d){7,}/g;

function redactText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(LONG_NUMBER, '[number]');
}

// Outgoing calls carry coordinates and API tokens in their query (PVGIS, Mapbox).
function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  // Console breadcrumbs replay logged arguments verbatim.
  if (breadcrumb.category === 'console') return null;
  const scrubbed: Sentry.Breadcrumb = { ...breadcrumb };
  if (scrubbed.message !== undefined) scrubbed.message = redactText(scrubbed.message);
  if (breadcrumb.data) {
    const { method, status_code: statusCode, url } = breadcrumb.data as Record<string, unknown>;
    scrubbed.data = {
      ...(method !== undefined && { method }),
      ...(statusCode !== undefined && { status_code: statusCode }),
      ...(typeof url === 'string' && { url: stripQuery(url) }),
    };
  }
  return scrubbed;
}

export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.request;
  delete event.user;
  if (event.message !== undefined) event.message = redactText(event.message);
  if (event.logentry) {
    event.logentry = event.logentry.message === undefined ? {} : { message: redactText(event.logentry.message) };
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value !== undefined) exception.value = redactText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter((crumb): crumb is Sentry.Breadcrumb => crumb !== null);
  }
  return event;
}

/** Starts Sentry when SENTRY_DSN is set; returns whether monitoring is on. Safe to call twice. */
export function initMonitoring(): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (enabled || !dsn) return enabled;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'production',
    sendDefaultPii: false,
    // tracesSampleRate left undefined: no tracing, so no spans carrying URLs or queries.
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    initialScope: { tags: { service: 'dossier-worker' } },
    // Uncaught exceptions are reported by the default integration (which still exits). For
    // rejections the default 'warn' mode would keep a broken worker alive; 'strict' reports and
    // then exits like Node does without Sentry, so Docker restarts it.
    integrations: [Sentry.onUnhandledRejectionIntegration({ mode: 'strict' })],
  });
  enabled = true;
  return true;
}

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

/** Reports an error with optional ids (job id, stage). Never pass client data in `context`. */
export function reportError(error: unknown, context?: ErrorContext): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Waits for queued events to be sent, before the process exits. */
export async function flushMonitoring(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  await Sentry.flush(timeoutMs);
}
