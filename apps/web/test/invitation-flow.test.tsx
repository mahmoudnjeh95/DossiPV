import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    mockRevalidatePath: vi.fn(),
    mockValidateSession: vi.fn(),
    mockHashPassword: vi.fn((password: string) => Promise.resolve(`hashed:${password}`)),
    companyFindUnique: vi.fn(),
    companyFindMany: vi.fn(),
    companyCount: vi.fn(),
    companyUpdate: vi.fn(),
    companyCreate: vi.fn(),
    companyDelete: vi.fn(),
    companyUserFindFirst: vi.fn(),
    companyUserCreate: vi.fn(),
    companyUserDeleteMany: vi.fn(),
    subscriptionFindUnique: vi.fn(),
    supplierProductFindMany: vi.fn(),
    libraryDeleteMany: vi.fn(),
    libraryCreateMany: vi.fn(),
    invitationFindUnique: vi.fn(),
    invitationUpdateMany: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('next/cache', () => ({ revalidatePath: m.mockRevalidatePath }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession, hashPassword: m.mockHashPassword };
});
vi.mock('@dossipv/db', () => {
  const db = {
    company: {
      findUnique: m.companyFindUnique,
      findMany: m.companyFindMany,
      count: m.companyCount,
      update: m.companyUpdate,
      create: m.companyCreate,
      delete: m.companyDelete,
    },
    companyUser: { findFirst: m.companyUserFindFirst, create: m.companyUserCreate, deleteMany: m.companyUserDeleteMany },
    subscription: { findUnique: m.subscriptionFindUnique },
    supplierProduct: { findMany: m.supplierProductFindMany },
    libraryItem: { deleteMany: m.libraryDeleteMany, createMany: m.libraryCreateMany },
    supplierInvitation: { findUnique: m.invitationFindUnique, updateMany: m.invitationUpdateMany },
    $transaction: (arg: unknown): Promise<unknown> =>
      typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(db) : Promise.all(arg as unknown[]),
  };
  return { db };
});

import { acceptInvitationAction, createAccountFromInvitationAction } from '../app/invitation/actions';
import InvitationPage from '../app/invitation/page';
import { acceptPendingInvitationAction } from '../app/(app)/settings/sponsorship-actions';

const TOKEN = 'raw-token';
const FUTURE = new Date(Date.now() + 3 * 24 * 3600 * 1000);
const invitationRow = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'inv-1',
  email: 'new@installer.tn',
  supplierCompanyId: 'supplier-1',
  supplierCompany: { name: 'SolarPlus' },
  acceptedAt: null,
  expiresAt: FUTURE,
  ...extra,
});

/** company-1 is an installer (sponsor: `sponsorCompanyId`); supplier-1 is the supplier. */
function setCompanies(installerSponsor: string | null = null): void {
  m.companyFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === 'company-1'
        ? { kind: 'INSTALLER', sponsorCompanyId: installerSponsor }
        : where.id === 'supplier-1'
          ? { kind: 'SUPPLIER', sponsorCompanyId: null }
          : null,
    ),
  );
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

const GOOD_FORM = {
  companyName: 'Nouvelle Sarl',
  contactName: 'Sami Ben Ali',
  phone: '20123456',
  email: 'new@installer.tn',
  anmeCode: 'AN-777',
  password: 'a-long-password-1',
  confirmation: 'a-long-password-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'token' });
  m.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' });
  m.mockRedirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  setCompanies();
  m.invitationFindUnique.mockResolvedValue(invitationRow());
  m.invitationUpdateMany.mockResolvedValue({ count: 1 });
  m.companyCount.mockResolvedValue(1);
  m.companyFindMany.mockResolvedValue([{ anmeCode: 'OTHER-1' }]);
  m.subscriptionFindUnique.mockResolvedValue({ plan: { maxSponsoredInstallers: 5, dossiersPerInstallerPerMonth: 3 }, status: 'ACTIVE' });
  m.supplierProductFindMany.mockResolvedValue([]);
  m.companyUserFindFirst.mockResolvedValue(null);
  m.companyCreate.mockResolvedValue({ id: 'company-new' });
  m.companyUserCreate.mockResolvedValue({ id: 'user-new' });
  m.companyUpdate.mockResolvedValue({});
  m.libraryDeleteMany.mockResolvedValue({ count: 0 });
  m.libraryCreateMany.mockResolvedValue({ count: 0 });
});

describe('acceptInvitationAction', () => {
  it('asks for a sign-in when nobody is signed in', async () => {
    m.mockGet.mockReturnValue(undefined);
    const result = await acceptInvitationAction(TOKEN);
    expect(result?.error).toMatch(/Connectez-vous/);
    expect(m.companyUpdate).not.toHaveBeenCalled();
  });

  it('refuses an invalid or expired link', async () => {
    m.invitationFindUnique.mockResolvedValue(invitationRow({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await acceptInvitationAction(TOKEN)).toEqual({ error: 'Cette invitation n’est plus valide.' });
    m.invitationFindUnique.mockResolvedValue(null);
    expect(await acceptInvitationAction(TOKEN)).toEqual({ error: 'Cette invitation n’est plus valide.' });
  });

  it('shows the pack-full message', async () => {
    m.companyCount.mockResolvedValue(5);
    const result = await acceptInvitationAction(TOKEN);
    expect(result?.error).toMatch(/pack est complet/);
    // The link is claimed first, then released because linking was refused: it stays usable.
    expect(m.invitationUpdateMany).toHaveBeenLastCalledWith({ where: { id: 'inv-1', acceptedCompanyId: 'company-1' }, data: { acceptedAt: null, acceptedCompanyId: null } });
  });

  it('shows the already-sponsored message', async () => {
    setCompanies('supplier-2');
    const result = await acceptInvitationAction(TOKEN);
    expect(result?.error).toMatch(/déjà parrainé par un autre fournisseur/);
  });

  it('links the installer, uses the invitation up and goes to the dashboard', async () => {
    await expect(acceptInvitationAction(TOKEN)).rejects.toThrow('NEXT_REDIRECT:/dashboard');
    expect(m.companyUpdate).toHaveBeenCalledWith({ where: { id: 'company-1' }, data: { sponsorCompanyId: 'supplier-1' } });
    expect(m.invitationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv-1', acceptedAt: null, expiresAt: { gt: expect.any(Date) as unknown } } }));
  });
});

describe('createAccountFromInvitationAction', () => {
  const run = (entries: Record<string, string> = {}): ReturnType<typeof createAccountFromInvitationAction> =>
    createAccountFromInvitationAction(TOKEN, undefined, form({ ...GOOD_FORM, ...entries }));

  it('refuses a bad token before reading anything', async () => {
    m.invitationFindUnique.mockResolvedValue(null);
    expect(await run()).toEqual({ error: 'Cette invitation n’est plus valide.' });
    expect(m.companyCreate).not.toHaveBeenCalled();
  });

  it("refuses an email other than the invitation's", async () => {
    const result = await run({ email: 'someone@else.tn' });
    expect(result?.error).toMatch(/celle de l’invitation/);
    expect(m.companyCreate).not.toHaveBeenCalled();
  });

  it('refuses an ANME code already registered (ignoring case, spaces and dashes)', async () => {
    m.companyFindMany.mockResolvedValue([{ anmeCode: 'an 777' }]);
    const result = await run();
    expect(result?.error).toMatch(/code ANME est déjà inscrit/);
    expect(m.companyCreate).not.toHaveBeenCalled();
  });

  it('refuses when the supplier pack is full', async () => {
    m.companyCount.mockResolvedValue(5);
    const result = await run();
    expect(result?.error).toMatch(/pack de ce fournisseur est complet/);
    expect(m.companyCreate).not.toHaveBeenCalled();
  });

  it('refuses an address that already has an account', async () => {
    m.companyUserFindFirst.mockResolvedValue({ id: 'user-x' });
    const result = await run();
    expect(result?.error).toMatch(/Un compte existe déjà/);
    expect(m.companyCreate).not.toHaveBeenCalled();
  });

  it('refuses a short password and mismatching confirmation', async () => {
    expect((await run({ password: 'short', confirmation: 'short' }))?.error).toMatch(/Mot de passe/);
    expect((await run({ confirmation: 'a-different-password' }))?.error).toMatch(/ne correspondent pas/);
    expect(m.companyCreate).not.toHaveBeenCalled();
  });

  it('creates a verified owner on an incomplete-profile company, links it, and sends the user to the login', async () => {
    // After creation the new company is the one linked: make it a valid installer for linkInstaller.
    m.companyFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === 'company-new'
          ? { kind: 'INSTALLER', sponsorCompanyId: null }
          : where.id === 'supplier-1'
            ? { kind: 'SUPPLIER', sponsorCompanyId: null }
            : null,
      ),
    );

    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/login?compte=cree');

    expect(m.companyCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { name: 'Nouvelle Sarl', anmeCode: 'AN-777', profileComplete: false, signupAt: expect.any(Date) as unknown },
    });
    expect(m.companyUserCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { companyId: 'company-new', email: 'new@installer.tn', role: 'OWNER', passwordHash: 'hashed:a-long-password-1', emailVerifiedAt: expect.any(Date) as unknown },
    });
    expect(m.companyUpdate).toHaveBeenCalledWith({ where: { id: 'company-new' }, data: { sponsorCompanyId: 'supplier-1' } });
    expect(m.invitationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inv-1', acceptedAt: null, expiresAt: { gt: expect.any(Date) as unknown } }, data: expect.objectContaining({ acceptedCompanyId: 'company-new' }) as unknown }),
    );
  });
});

describe('acceptPendingInvitationAction (Paramètres)', () => {
  it('refuses an invitation addressed to someone else', async () => {
    m.invitationFindUnique.mockResolvedValue(invitationRow({ email: 'other@x.tn' }));
    expect(await acceptPendingInvitationAction('inv-1')).toEqual({ error: 'Cette invitation n’est plus valide.' });
    expect(m.companyUpdate).not.toHaveBeenCalled();
  });

  it("links the installer when the invitation is addressed to the signed-in user's email", async () => {
    m.invitationFindUnique.mockResolvedValue(invitationRow({ email: 'a@b.com' }));
    expect(await acceptPendingInvitationAction('inv-1')).toBeUndefined();
    expect(m.companyUpdate).toHaveBeenCalledWith({ where: { id: 'company-1' }, data: { sponsorCompanyId: 'supplier-1' } });
  });
});

describe('acceptPendingInvitationAction (who may accept)', () => {
  it('refuses a support session and a non-owner', async () => {
    m.invitationFindUnique.mockResolvedValue(invitationRow({ email: 'a@b.com' }));
    m.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER', impersonatedBySuperAdminId: 'admin-1' });
    expect(await acceptPendingInvitationAction('inv-1')).toEqual({ error: expect.any(String) });
    m.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'MEMBER' });
    expect(await acceptPendingInvitationAction('inv-1')).toEqual({ error: expect.any(String) });
    expect(m.companyUpdate).not.toHaveBeenCalled();
  });
});

describe('/invitation page', () => {
  const render = async (token?: string): Promise<string> =>
    renderToStaticMarkup(await InvitationPage({ searchParams: Promise.resolve(token ? { token } : {}) }));

  it('says the link is no longer valid', async () => {
    m.invitationFindUnique.mockResolvedValue(null);
    expect(await render(TOKEN)).toContain('Cette invitation n’est plus valide.');
    expect(await render()).toContain('Cette invitation n’est plus valide.');
  });

  it('offers sign-in and account creation to a visitor who is not signed in', async () => {
    m.mockGet.mockReturnValue(undefined);
    const html = await render(TOKEN);
    expect(html).toContain('SolarPlus vous invite à utiliser DossiPV');
    expect(html).toContain('me connecter');
    expect(html).toContain('Créer mon compte');
    expect(html).toContain('value="new@installer.tn"');
    expect(html).toContain('readOnly');
  });

  it('shows the accept button to a signed-in installer', async () => {
    const html = await render(TOKEN);
    expect(html).toContain('SolarPlus vous invite à utiliser DossiPV');
    expect(html).toContain('Accepter');
    expect(html).not.toContain('Créer mon compte');
  });
});
