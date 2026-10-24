import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

/**
 * Shared Sentry settings for the server, edge and browser inits. The dossiers carry client
 * names, CIN numbers, addresses, phone numbers, STEG references and bill contents: none of it
 * may reach Sentry, so every event and breadcrumb goes through the scrubbers below and the SDK
 * never attaches PII on its own (`sendDefaultPii: false`).
 */

const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g;
// CIN (8 digits), Tunisian phone numbers (8 digits, optionally +216, spaced or dotted) and STEG
// references (long digit runs). Dashes are left out so dates and ISO timestamps stay readable.
const LONG_NUMBER = /(?:\+?216[\s.]?)?\d(?:[\s.]?\d){7,}/g;

/** Masks e-mail addresses and identifier-like digit runs inside free text (error messages). */
export function redactText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(LONG_NUMBER, '[number]');
}

/** Drops the query string and fragment: search params can carry names, ids and API tokens. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Breadcrumb data keys worth keeping; anything else (bodies, arguments, inputs) is dropped. */
const KEPT_BREADCRUMB_DATA = ['method', 'status_code', 'url', 'from', 'to'] as const;

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console breadcrumbs replay logged arguments verbatim, which is where request data ends up.
  if (breadcrumb.category === 'console') return null;

  const scrubbed: Breadcrumb = { ...breadcrumb };
  if (scrubbed.message !== undefined) scrubbed.message = redactText(scrubbed.message);
  if (breadcrumb.data) {
    const data: Record<string, unknown> = {};
    for (const key of KEPT_BREADCRUMB_DATA) {
      const value: unknown = breadcrumb.data[key];
      if (value === undefined) continue;
      data[key] = typeof value === 'string' && key !== 'method' ? stripQuery(value) : value;
    }
    scrubbed.data = data;
  }
  return scrubbed;
}

/** `beforeSend`: keeps what is needed to debug (stack, route, method) and nothing personal. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    const { method, url } = event.request;
    event.request = { ...(method !== undefined && { method }), ...(url !== undefined && { url: stripQuery(url) }) };
  }

  if (event.user) {
    if (event.user.id === undefined) delete event.user;
    else event.user = { id: event.user.id };
  }

  if (event.message !== undefined) event.message = redactText(event.message);
  if (event.logentry) {
    // Params are the raw values interpolated into the message: dropped, not redacted.
    event.logentry = event.logentry.message === undefined ? {} : { message: redactText(event.logentry.message) };
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value !== undefined) exception.value = redactText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars;
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter((crumb): crumb is Breadcrumb => crumb !== null);
  }

  // captureRequestError records the raw request path, query string included.
  const nextjs = event.contexts?.nextjs;
  if (nextjs && typeof nextjs.request_path === 'string') {
    nextjs.request_path = stripQuery(nextjs.request_path);
  }

  return event;
}

export interface SharedSentryOptions {
  dsn: string;
  environment: string;
  sendDefaultPii: false;
  beforeSend: typeof scrubEvent;
  beforeBreadcrumb: typeof scrubBreadcrumb;
}

/** The options every init shares; only the DSN differs between server and browser. */
export function sentryOptions(dsn: string): SharedSentryOptions {
  return {
    dsn,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    // No tracesSampleRate on purpose: leaving it undefined disables tracing entirely (no spans,
    // no URLs or DB queries in transactions); 0 would still load the tracing integrations.
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
