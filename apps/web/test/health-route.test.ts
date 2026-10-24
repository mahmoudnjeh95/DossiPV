import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock('@dossipv/db', () => ({ db: { $queryRaw: mocks.queryRaw } }));

import { GET } from '../app/api/health/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('answers 200 ok, uncached, when the database answers', async () => {
    mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('answers 503 without internal details when the query fails', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED postgres:5432'));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe(JSON.stringify({ status: 'error' }));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers 503 when the database hangs past the timeout', async () => {
    vi.useFakeTimers();
    mocks.queryRaw.mockReturnValue(new Promise(() => {}));

    const pending = GET();
    await vi.advanceTimersByTimeAsync(3000);
    const response = await pending;

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'error' });
  });
});
