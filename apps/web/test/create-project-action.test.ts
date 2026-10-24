import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGet,
  mockCookies,
  mockRedirect,
  mockValidateSession,
  mockSubscriptionFindUnique,
  mockProjectCreate,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn(),
    mockValidateSession: vi.fn(),
    mockSubscriptionFindUnique: vi.fn(),
    mockProjectCreate: vi.fn(),
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
      subscription: { findUnique: mockSubscriptionFindUnique },
      company: { findUnique: (): Promise<unknown> => Promise.resolve((mockSubscriptionFindUnique as () => unknown)()).then((subscription) => ({ sponsorCompanyId: null, subscription })) },
      project: { create: mockProjectCreate },
    },
  };
});

import { createProjectAction } from '../app/(app)/projects/actions';

const user = {
  id: 'user-1',
  companyId: 'company-1',
  email: 'a@b.com',
  fullName: 'A',
  role: 'OWNER' as const,
};

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    data.set(k, v);
  }
  return data;
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockReturnValue({ value: 'valid-token' });
  mockRedirect.mockClear();
  mockValidateSession.mockReset();
  mockValidateSession.mockResolvedValue(user);
  mockSubscriptionFindUnique.mockReset();
  mockProjectCreate.mockReset();
});

describe('createProjectAction', () => {
  it("creates a draft project for the caller's company with the tier from the plan and redirects to it", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({ plan: { tier: 'PREMIUM' } });
    mockProjectCreate.mockResolvedValue({ id: 'project-9' });

    const result = await createProjectAction(
      undefined,
      form({
        fullName: 'Habib Khedhira',
        clientKind: 'residential',
        civility: 'M.',
        stegReference: '',
      }),
    );

    expect(result).toBeUndefined();
    expect(mockProjectCreate).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        tier: 'PREMIUM',
        with3d: true,
        status: 'DRAFT',
        client: {
          create: {
            fullName: 'Habib Khedhira',
            civility: 'M.',
            clientKind: 'residential',
            stegReference: null,
          },
        },
      },
    });
    expect(mockRedirect).toHaveBeenCalledWith('/projects/project-9');
  });

  it('falls back to STANDARD without a subscription', async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null);
    mockProjectCreate.mockResolvedValue({ id: 'project-9' });

    await createProjectAction(undefined, form({ fullName: 'X', clientKind: 'professional' }));

    expect(mockProjectCreate.mock.calls[0]?.[0]).toMatchObject({ data: { tier: 'STANDARD' } });
  });

  it('rejects an empty name and an unknown client kind without touching the database', async () => {
    const result = await createProjectAction(
      undefined,
      form({ fullName: '   ', clientKind: 'alien' }),
    );

    expect(result).toEqual({
      error: 'Nom du client : champ obligatoire. Type de client : valeur invalide.',
    });
    expect(mockProjectCreate).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
