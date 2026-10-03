import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockCookies, mockRedirect, mockValidateSession, mockProjectFindFirst } = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    mockProjectFindFirst: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect, notFound: vi.fn() }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, project: { findFirst: mockProjectFindFirst } } };
});

import { loadMapPageData } from '../app/(app)/projects/[id]/map/page';

const authenticatedUser = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-token' });
  mockValidateSession.mockReset();
  mockValidateSession.mockResolvedValue(authenticatedUser);
  mockProjectFindFirst.mockClear();
});

describe('loadMapPageData', () => {
  it('returns tier STANDARD for a Standard-tier project, so the editor renders single-pin-only mode', async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: 'project-1',
      tier: 'STANDARD',
      site: {
        gpsLat: 36.8,
        gpsLon: 10.1,
        technicalRoomPointLat: null,
        technicalRoomPointLon: null,
        meterPointLat: null,
        meterPointLon: null,
        earthPitPointLat: null,
        earthPitPointLon: null,
      },
      imagery: null,
    });

    const result = await loadMapPageData('project-1');

    expect(result?.project.tier).toBe('STANDARD');
  });

  it('returns null when the project belongs to a different company (findFirst scoped by companyId returns nothing)', async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    const result = await loadMapPageData('someone-elses-project');

    expect(result).toBeNull();
  });

  it('computes moduleInfo by summing stringsInParallel x modulesPerString across every MPPT of every inverter', async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: 'project-1',
      tier: 'PREMIUM',
      site: {
        gpsLat: 36.8,
        gpsLon: 10.1,
        technicalRoomPointLat: null,
        technicalRoomPointLon: null,
        meterPointLat: null,
        meterPointLon: null,
        earthPitPointLat: null,
        earthPitPointLon: null,
        tiltDeg: 30,
      },
      imagery: null,
      arrayConfig: {
        module: { lengthMm: 2278, widthMm: 1134 },
        inverters: [
          { mppts: [{ stringsInParallel: 2, modulesPerString: 10 }, { stringsInParallel: 1, modulesPerString: 8 }] },
          { mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] },
        ],
      },
    });

    const result = await loadMapPageData('project-1');

    expect(result?.moduleInfo).toEqual({ count: 2 * 10 + 1 * 8 + 1 * 5, lengthM: 2.278, widthM: 1.134, tiltDeg: 30 });
  });

  it('returns a null moduleInfo when the project has no array config yet', async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: 'project-1',
      tier: 'PREMIUM',
      site: {
        gpsLat: 36.8,
        gpsLon: 10.1,
        technicalRoomPointLat: null,
        technicalRoomPointLon: null,
        meterPointLat: null,
        meterPointLon: null,
        earthPitPointLat: null,
        earthPitPointLon: null,
        tiltDeg: 30,
      },
      imagery: null,
      arrayConfig: null,
    });

    const result = await loadMapPageData('project-1');

    expect(result?.moduleInfo).toBeNull();
  });
});
