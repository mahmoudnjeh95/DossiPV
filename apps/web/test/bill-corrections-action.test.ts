import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    mockValidateSession: vi.fn(),
    mockProjectFindFirst: vi.fn(),
    mockJobCount: vi.fn(),
    mockClientFindUnique: vi.fn(),
    mockClientUpdate: vi.fn(),
    mockRevalidatePath: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: m.mockRevalidatePath }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      project: { findFirst: m.mockProjectFindFirst },
      dossierJob: { count: m.mockJobCount },
      projectClient: { findUnique: m.mockClientFindUnique, update: m.mockClientUpdate },
    },
  };
});

import { saveBillCorrectionsAction } from '../app/(app)/projects/[id]/proposals/actions';

const user = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const values = {
    fullName: 'MR TEST CLIENT',
    stegReference: '123456',
    subscribedPowerKVA: '3',
    annualConsumptionKWh: '4200',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'valid-token' });
  m.mockValidateSession.mockResolvedValue(user);
  m.mockProjectFindFirst.mockResolvedValue({ id: 'p1', companyId: 'company-1', tier: 'STANDARD', status: 'DRAFT' });
  m.mockJobCount.mockResolvedValue(0);
  m.mockClientFindUnique.mockResolvedValue({ fullName: 'OLD', stegReference: 'OLDREF' });
  m.mockClientUpdate.mockResolvedValue({});
});

describe('saveBillCorrectionsAction', () => {
  it('guards first: an unauthenticated caller is redirected and nothing is written', async () => {
    m.mockValidateSession.mockResolvedValue(null);
    await expect(saveBillCorrectionsAction('p1', undefined, form())).rejects.toThrow('NEXT_REDIRECT');
    expect(m.mockClientUpdate).not.toHaveBeenCalled();
  });

  it('returns not found for a project of another company', async () => {
    m.mockProjectFindFirst.mockResolvedValue(null);
    expect(await saveBillCorrectionsAction('p1', undefined, form())).toEqual({ error: 'Projet introuvable.' });
    expect(m.mockClientUpdate).not.toHaveBeenCalled();
  });

  it('rejects a zero subscribed power', async () => {
    const result = await saveBillCorrectionsAction('p1', undefined, form({ subscribedPowerKVA: '0' }));
    expect(result?.error).toContain('Puissance souscrite');
    expect(m.mockClientUpdate).not.toHaveBeenCalled();
  });

  it('saves valid corrections as numbers and revalidates the proposals page', async () => {
    const result = await saveBillCorrectionsAction('p1', undefined, form());
    expect(result).toBeUndefined();
    expect(m.mockClientUpdate).toHaveBeenCalledWith({
      where: { projectId: 'p1' },
      data: { fullName: 'MR TEST CLIENT', stegReference: '123456', subscribedPowerKVA: 3, annualConsumptionKWh: 4200 },
    });
    expect(m.mockRevalidatePath).toHaveBeenCalledWith('/projects/p1/proposals');
  });

  it('keeps the name and STEG reference once a dossier was generated', async () => {
    m.mockJobCount.mockResolvedValue(1);
    await saveBillCorrectionsAction('p1', undefined, form({ fullName: 'OTHER' }));
    expect(m.mockClientUpdate).toHaveBeenCalledWith({
      where: { projectId: 'p1' },
      data: expect.objectContaining({ fullName: 'OLD', stegReference: 'OLDREF' }) as unknown,
    });
  });
});
