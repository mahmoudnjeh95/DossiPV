import { describe, it, expect } from 'vitest';
import { redactText, scrubBreadcrumb, scrubEvent, sentryOptions, stripQuery } from '../lib/monitoring';

describe('redactText', () => {
  it('masks e-mails, CIN, phone numbers and STEG references but keeps dates', () => {
    expect(redactText('Client ali.ben@example.tn CIN 01234567 tel +216 98 765 432 ref 123456789012 le 2026-10-24')).toBe(
      'Client [email] CIN [number] tel [number] ref [number] le 2026-10-24',
    );
  });

  it('leaves short numbers alone', () => {
    expect(redactText('Job 42 failed after 3 retries (HTTP 503)')).toBe('Job 42 failed after 3 retries (HTTP 503)');
  });
});

describe('stripQuery', () => {
  it('drops the query string and fragment', () => {
    expect(stripQuery('https://api.mapbox.com/styles?access_token=pk.secret#x')).toBe('https://api.mapbox.com/styles');
    expect(stripQuery('/projects/p1')).toBe('/projects/p1');
  });
});

describe('scrubEvent', () => {
  it('drops request body, cookies, headers and query, and the user ip and e-mail', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://dossipv.tn/projects/p1?client=Ben%20Ali',
        data: { cin: '01234567' },
        cookies: { dossipv_session: 'secret' },
        headers: { cookie: 'dossipv_session=secret' },
        query_string: 'client=Ben%20Ali',
      },
      user: { id: 'user-1', email: 'owner@example.tn', ip_address: '1.2.3.4' },
    });

    expect(event.request).toEqual({ method: 'POST', url: 'https://dossipv.tn/projects/p1' });
    expect(event.user).toEqual({ id: 'user-1' });
  });

  it('redacts exception messages, drops local variables, scrubs breadcrumbs and the Next request path', () => {
    const event = scrubEvent({
      type: undefined,
      message: 'Facture de 98765432',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'No client for CIN 01234567',
            stacktrace: { frames: [{ filename: 'a.ts', vars: { cin: '01234567' } }] },
          },
        ],
      },
      breadcrumbs: [
        { category: 'console', message: 'Saving client Ben Ali', data: { arguments: ['Ben Ali'] } },
        { category: 'fetch', data: { method: 'POST', url: '/api/x?name=Ben', status_code: 500, body: '{"cin":"01234567"}' } },
      ],
      contexts: { nextjs: { request_path: '/projects?search=Ben', route_type: 'render' } },
    });

    expect(event.message).toBe('Facture de [number]');
    expect(event.exception?.values?.[0]?.value).toBe('No client for CIN [number]');
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ filename: 'a.ts' });
    expect(event.breadcrumbs).toEqual([{ category: 'fetch', data: { method: 'POST', url: '/api/x', status_code: 500 } }]);
    expect(event.contexts?.nextjs).toEqual({ request_path: '/projects', route_type: 'render' });
  });

  it('removes a user without an id entirely', () => {
    expect(scrubEvent({ type: undefined, user: { ip_address: '1.2.3.4' } }).user).toBeUndefined();
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs and strips navigation queries', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'navigation', data: { from: '/a?q=1', to: '/b#c' } })).toEqual({
      category: 'navigation',
      data: { from: '/a', to: '/b' },
    });
  });
});

describe('sentryOptions', () => {
  it('never sends default PII, leaves tracing off and wires both scrubbers', () => {
    const options = sentryOptions('https://key@o1.ingest.sentry.io/1');
    expect(options.sendDefaultPii).toBe(false);
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeBreadcrumb).toBe(scrubBreadcrumb);
  });
});
