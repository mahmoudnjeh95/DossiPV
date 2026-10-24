import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockValidateSession: vi.fn(),
    mockValidateSuperAdminSession: vi.fn(),
    mockIntentFindFirst: vi.fn(),
    mockIntentFindUnique: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession, validateSuperAdminSession: m.mockValidateSuperAdminSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, paymentIntent: { findFirst: m.mockIntentFindFirst, findUnique: m.mockIntentFindUnique } } };
});

import { GET as ownerCapture } from '../app/paiement/[intentId]/capture/route';
import { GET as adminCapture } from '../app/admin/(protected)/paiements/[id]/capture/route';

const request = new Request('http://localhost/capture');
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'token' });
  m.mockValidateSession.mockResolvedValue({ id: 'u1', companyId: 'c1' });
  m.mockValidateSuperAdminSession.mockResolvedValue({ id: 'admin-1' });
});

describe('GET /paiement/[intentId]/capture (owner company)', () => {
  const params = { params: Promise.resolve({ intentId: 'i1' }) };

  it('is refused without a session', async () => {
    m.mockGet.mockReturnValue(undefined);
    expect((await ownerCapture(request, params)).status).toBe(401);
    expect(m.mockIntentFindFirst).not.toHaveBeenCalled();
  });

  it('looks the intent up scoped to the caller company, so another company gets a 404', async () => {
    m.mockIntentFindFirst.mockResolvedValue(null);
    expect((await ownerCapture(request, params)).status).toBe(404);
    expect(m.mockIntentFindFirst).toHaveBeenCalledWith({ where: { id: 'i1', companyId: 'c1' }, select: { proofImage: true, proofMime: true } });
  });

  it('serves its own screenshot, private and uncached', async () => {
    m.mockIntentFindFirst.mockResolvedValue({ proofImage: bytes, proofMime: 'image/jpeg' });
    const response = await ownerCapture(request, params);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('is a 404 once the screenshot was erased', async () => {
    m.mockIntentFindFirst.mockResolvedValue({ proofImage: null, proofMime: null });
    expect((await ownerCapture(request, params)).status).toBe(404);
  });
});

describe('GET /admin/paiements/[id]/capture (admin only)', () => {
  const params = { params: Promise.resolve({ id: 'i1' }) };

  it('is refused without an admin session, even with a company session', async () => {
    m.mockValidateSuperAdminSession.mockResolvedValue(null);
    expect((await adminCapture(request, params)).status).toBe(401);
    expect(m.mockIntentFindUnique).not.toHaveBeenCalled();
  });

  it('serves the screenshot of any company', async () => {
    m.mockIntentFindUnique.mockResolvedValue({ proofImage: bytes, proofMime: 'image/jpeg' });
    const response = await adminCapture(request, params);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('is a 404 for an unknown intent and once the screenshot was erased', async () => {
    m.mockIntentFindUnique.mockResolvedValue(null);
    expect((await adminCapture(request, params)).status).toBe(404);
    m.mockIntentFindUnique.mockResolvedValue({ proofImage: null, proofMime: null });
    expect((await adminCapture(request, params)).status).toBe(404);
  });
});
