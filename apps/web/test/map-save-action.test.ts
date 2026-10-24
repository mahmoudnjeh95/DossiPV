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
      ...actual.db, company: { findUnique: (): Promise<{ kind: string }> => Promise.resolve({ kind: 'INSTALLER' }) },
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
  geometry: {
    outline: [
      { lat: 36.8, lon: 10.1 },
      { lat: 36.8001, lon: 10.1 },
      { lat: 36.8001, lon: 10.1001 },
    ],
    panelRows: [],
    manualOverride: false,
  },
};

describe('saveMapDataAction', () => {
  it("updates ProjectSite and upserts ProjectImagery when the project belongs to the caller's company", async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'project-1', companyId: 'company-1', tier: 'PREMIUM' });
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
    mockProjectFindFirst.mockResolvedValue({ id: 'project-1', companyId: 'company-1', tier: 'STANDARD' });
    mockSiteUpdate.mockResolvedValue({});

    const withoutGeometry: typeof samplePayload = { ...samplePayload };
    delete withoutGeometry.geometry;
    await saveMapDataAction('project-1', withoutGeometry);

    expect(mockSiteUpdate).toHaveBeenCalled();
    expect(mockImageryUpsert).not.toHaveBeenCalled();
  });

  it('rejects a geometry payload sent for a Standard-tier project, even if the client sends one anyway', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'project-1', companyId: 'company-1', tier: 'STANDARD' });
    mockSiteUpdate.mockResolvedValue({});

    const result = await saveMapDataAction('project-1', samplePayload);

    expect(mockImageryUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Le contour et le remplissage automatique nécessitent l'abonnement Premium." });
  });
});

describe('saveMapDataAction input validation', () => {
  beforeEach(() => {
    mockProjectFindFirst.mockResolvedValue({ id: 'project-1', companyId: 'company-1', tier: 'PREMIUM' });
  });

  it.each([
    ['NaN latitude', { ...samplePayload, gpsLat: Number.NaN }],
    ['Infinity longitude', { ...samplePayload, gpsLon: Number.POSITIVE_INFINITY }],
    ['out-of-range latitude (> 90)', { ...samplePayload, gpsLat: 91 }],
    ['out-of-range latitude (< -90)', { ...samplePayload, gpsLat: -91 }],
    ['out-of-range longitude (> 180)', { ...samplePayload, gpsLon: 181 }],
    ['out-of-range longitude (< -180)', { ...samplePayload, gpsLon: -181 }],
  ])('rejects %s without writing anything', async (_label, payload) => {
    const result = await saveMapDataAction('project-1', payload);

    expect(mockSiteUpdate).not.toHaveBeenCalled();
    expect(mockImageryUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Coordonnées invalides.' });
  });

  it('rejects an out-of-range pin coordinate without writing anything', async () => {
    const result = await saveMapDataAction('project-1', { ...samplePayload, technicalRoomPointLat: 200 });

    expect(mockSiteUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Coordonnées invalides.' });
  });

  it('rejects a geometry outline containing an out-of-range point', async () => {
    const result = await saveMapDataAction('project-1', {
      ...samplePayload,
      geometry: { outline: [{ lat: 36.8, lon: 999 }], panelRows: [], manualOverride: false },
    });

    expect(mockImageryUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Coordonnées invalides.' });
  });

  it('rejects an outline with fewer than 3 points when geometry is provided', async () => {
    const result = await saveMapDataAction('project-1', {
      ...samplePayload,
      geometry: { outline: [{ lat: 36.8, lon: 10.1 }], panelRows: [], manualOverride: false },
    });

    expect(mockImageryUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Coordonnées invalides.' });
  });

  it('rejects an outline exceeding a reasonable maximum vertex count', async () => {
    const hugeOutline = Array.from({ length: 1001 }, (_, i) => ({ lat: 36.8 + i * 0.0001, lon: 10.1 }));
    const result = await saveMapDataAction('project-1', {
      ...samplePayload,
      geometry: { outline: hugeOutline, panelRows: [], manualOverride: false },
    });

    expect(mockImageryUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Coordonnées invalides.' });
  });

  it('accepts a valid payload at the boundary of the lat/lon range', async () => {
    mockSiteUpdate.mockResolvedValue({});
    mockImageryUpsert.mockResolvedValue({});

    const result = await saveMapDataAction('project-1', {
      ...samplePayload,
      gpsLat: 90,
      gpsLon: -180,
    });

    expect(result).toBeUndefined();
    expect(mockSiteUpdate).toHaveBeenCalled();
  });
});
