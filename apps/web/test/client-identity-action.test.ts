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
    mockStoreAnnexFiles: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: m.mockRevalidatePath }));
vi.mock('../lib/annex-upload', () => ({ storeAnnexFiles: m.mockStoreAnnexFiles }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db, company: { findUnique: () => Promise.resolve({ kind: 'INSTALLER' }) },
      project: { findFirst: m.mockProjectFindFirst },
      dossierJob: { count: m.mockJobCount },
      projectClient: { findUnique: m.mockClientFindUnique, update: m.mockClientUpdate },
    },
  };
});

import { saveClientIdentityAction } from '../app/(app)/projects/[id]/proposals/actions';

const user = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };

function form(entries: [string, string | File][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}
const photo = (): File => new File([new Uint8Array([1, 2, 3])], 'cin.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'valid-token' });
  m.mockValidateSession.mockResolvedValue(user);
  m.mockProjectFindFirst.mockResolvedValue({ id: 'p1', companyId: 'company-1', tier: 'STANDARD', status: 'DRAFT' });
  m.mockJobCount.mockResolvedValue(0);
  m.mockClientFindUnique.mockResolvedValue({ fullName: 'Client à compléter', cin: null });
  m.mockClientUpdate.mockResolvedValue({});
  m.mockStoreAnnexFiles.mockResolvedValue(null);
});

describe('saveClientIdentityAction', () => {
  it('guards first: an unauthenticated caller is redirected and nothing is written', async () => {
    m.mockValidateSession.mockResolvedValue(null);
    await expect(saveClientIdentityAction('p1', undefined, form([['fullName', 'MR TEST CLIENT']]))).rejects.toThrow('NEXT_REDIRECT');
    expect(m.mockStoreAnnexFiles).not.toHaveBeenCalled();
    expect(m.mockClientUpdate).not.toHaveBeenCalled();
  });

  it('refuses the placeholder name', async () => {
    const result = await saveClientIdentityAction('p1', undefined, form([['fullName', 'Client à compléter']]));
    expect(result).toEqual({ error: 'Indiquez le nom du titulaire du contrat STEG.' });
    expect(m.mockClientUpdate).not.toHaveBeenCalled();
  });

  it('stores the name and ignores any CIN field', async () => {
    const data = form([['fullName', ' MR TEST CLIENT '], ['cin', '0123456']]);
    expect(await saveClientIdentityAction('p1', undefined, data)).toBeUndefined();
    expect(m.mockStoreAnnexFiles).toHaveBeenCalledWith('p1', data);
    expect(m.mockClientUpdate).toHaveBeenCalledWith({ where: { projectId: 'p1' }, data: { fullName: 'MR TEST CLIENT' } });
    expect(m.mockRevalidatePath).toHaveBeenCalledWith('/projects/p1/proposals');
  });

  it('does not rename a locked identity', async () => {
    m.mockJobCount.mockResolvedValue(1);
    await saveClientIdentityAction('p1', undefined, form([['fullName', 'AUTRE NOM']]));
    expect(m.mockClientUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing when the photo is invalid', async () => {
    m.mockStoreAnnexFiles.mockResolvedValue({ error: 'Fichier invalide.' });
    const result = await saveClientIdentityAction('p1', undefined, form([['cin', photo()], ['fullName', 'MR TEST CLIENT']]));
    expect(result).toEqual({ error: 'Fichier invalide.' });
    expect(m.mockClientUpdate).not.toHaveBeenCalled();
    expect(m.mockRevalidatePath).not.toHaveBeenCalled();
  });
});
