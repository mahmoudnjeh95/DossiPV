import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn<(options: Record<string, unknown>) => void>(),
  captureException: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
  onUnhandledRejectionIntegration: vi.fn((options: unknown) => ({ name: 'OnUnhandledRejection', options })),
}));

vi.mock('@sentry/node', () => sentry);

type Monitoring = typeof import('../src/monitoring');

// Each test gets a fresh module: the "already started" flag is module state.
async function load(): Promise<Monitoring> {
  vi.resetModules();
  return import('../src/monitoring');
}

const savedDsn = process.env.SENTRY_DSN;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SENTRY_DSN;
});

afterEach(() => {
  if (savedDsn === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = savedDsn;
});

describe('without SENTRY_DSN', () => {
  it('never starts Sentry and makes reportError and flushMonitoring no-ops', async () => {
    process.env.SENTRY_DSN = '  ';
    const monitoring = await load();

    expect(monitoring.initMonitoring()).toBe(false);
    monitoring.reportError(new Error('boom'), { jobId: 'job-1' });
    await monitoring.flushMonitoring();

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.flush).not.toHaveBeenCalled();
  });
});

describe('with SENTRY_DSN', () => {
  it('starts Sentry once, without default PII, with the scrubbers and strict rejection handling', async () => {
    process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/1';
    const monitoring = await load();

    expect(monitoring.initMonitoring()).toBe(true);
    expect(monitoring.initMonitoring()).toBe(true);

    expect(sentry.init).toHaveBeenCalledTimes(1);
    const options = sentry.init.mock.calls[0]![0];
    expect(options).toMatchObject({
      dsn: 'https://key@o1.ingest.sentry.io/1',
      sendDefaultPii: false,
      beforeSend: monitoring.scrubEvent,
      beforeBreadcrumb: monitoring.scrubBreadcrumb,
    });
    expect(options.tracesSampleRate).toBeUndefined();
    expect(sentry.onUnhandledRejectionIntegration).toHaveBeenCalledWith({ mode: 'strict' });
  });

  it('reports errors with their id context and flushes', async () => {
    process.env.SENTRY_DSN = 'https://key@o1.ingest.sentry.io/1';
    const monitoring = await load();
    monitoring.initMonitoring();
    const error = new Error('boom');

    monitoring.reportError(error, { jobId: 'job-1' });
    monitoring.reportError(error);
    await monitoring.flushMonitoring(500);

    expect(sentry.captureException).toHaveBeenNthCalledWith(1, error, { extra: { jobId: 'job-1' } });
    expect(sentry.captureException).toHaveBeenNthCalledWith(2, error, undefined);
    expect(sentry.flush).toHaveBeenCalledWith(500);
  });
});

describe('scrubbing', () => {
  it('drops request and user, redacts messages and local variables, filters breadcrumbs', async () => {
    const { scrubEvent } = await load();
    const event = scrubEvent({
      type: undefined,
      request: { url: 'http://x', data: 'body' },
      user: { email: 'a@b.tn' },
      message: 'Bill 123456789012 for a@b.tn',
      exception: { values: [{ value: 'CIN 01234567 invalid', stacktrace: { frames: [{ vars: { cin: '01234567' } }] } }] },
      breadcrumbs: [
        { category: 'console', message: 'client Ben Ali' },
        { category: 'http', data: { method: 'GET', url: 'https://re.jrc.ec.europa.eu/api/PVcalc?lat=36.8&lon=10.1', status_code: 200, extra: 'x' } },
      ],
    });

    expect(event.request).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.message).toBe('Bill [number] for [email]');
    expect(event.exception?.values?.[0]?.value).toBe('CIN [number] invalid');
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({});
    expect(event.breadcrumbs).toEqual([
      { category: 'http', data: { method: 'GET', url: 'https://re.jrc.ec.europa.eu/api/PVcalc', status_code: 200 } },
    ]);
  });
});
