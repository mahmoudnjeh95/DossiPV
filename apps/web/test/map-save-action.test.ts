import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockCookies, mockRedirect, mockValidateSession, mockProjectFindFirst, mockSiteUpdate, mockImageryUpsert } = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    mockProjectFindFirst: vi.fn(),
    mockSiteUpdate: vi.fn(),
    mockImageryUpsert: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      project: { findFirst: mockProjectFindFirst },
      projectSite: { update: mockSiteUpdate },
      projectImagery: { upsert: mockImageryUpsert },
    },
  };
});

import { saveMapDataAction, type MapSavePayload } from '../app/(app)/projects/[id]/map/actions';

const authenticatedUser = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-token' });
  mockRedirect.mockClear();
  mockValidateSession.mockReset();
  mockValidateSession.mockResolvedValue(authenticatedUser);
  mockProjectFindFirst.mockClear();
  mockSiteUpdate.mockClear();
  mockImageryUpsert.mockClear();
});

const samplePayload: MapSavePayload = {
  gpsLat: 36.8,
  gpsLon: 10.1,
  technicalRoomPointLat: 36.8001,
  technicalRoomPointLon: 10.1001,
  meterPointLat: 36.8002,
  meterPointLon: 10.1002,
  earthPitPointLat: 36.8003,
  earthPitPointLon: 10.1003,
  geometry: { outline: [{ lat: 36.8, lon: 10.1 }], panelRows: [], manualOverride: false },
};

describe('saveMapDataAction', () => {
  it("updates ProjectSite and upserts ProjectImagery when the project belongs to the caller's company", async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'project-1', companyId: 'company-1' });
    mockSiteUpdate.mockResolvedValue({});
    mockImageryUpsert.mockResolvedValue({});

    await saveMapDataAction('project-1', samplePayload);

    expect(mockProjectFindFirst).toHaveBeenCalledWith({ where: { id: 'project-1', companyId: 'company-1' } });
    expect(mockSiteUpdate).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      data: {
        gpsLat: 36.8,
        gpsLon: 10.1,
        technicalRoomPointLat: 36.8001,
        technicalRoomPointLon: 10.1001,
        meterPointLat: 36.8002,
        meterPointLon: 10.1002,
        earthPitPointLat: 36.8003,
        earthPitPointLon: 10.1003,
      },
    });
    expect(mockImageryUpsert).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      create: { projectId: 'project-1', geometry: samplePayload.geometry },
      update: { geometry: samplePayload.geometry },
    });
  });

  it('does nothing and returns an error when the project belongs to a different company', async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    const result = await saveMapDataAction('someone-elses-project', samplePayload);

    expect(mockSiteUpdate).not.toHaveBeenCalled();
    expect(mockImageryUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Projet introuvable.' });
  });

  it('skips the ProjectImagery upsert when geometry is omitted (Standard tier, single-pin only)', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'project-1', companyId: 'company-1' });
    mockSiteUpdate.mockResolvedValue({});

    const withoutGeometry: typeof samplePayload = { ...samplePayload };
    delete withoutGeometry.geometry;
    await saveMapDataAction('project-1', withoutGeometry);

    expect(mockSiteUpdate).toHaveBeenCalled();
    expect(mockImageryUpsert).not.toHaveBeenCalled();
  });
});
