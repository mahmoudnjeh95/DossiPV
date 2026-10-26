/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unnecessary-type-assertion -- mocked modules of loosely typed call arguments */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const tx = {
    pvModule: { create: vi.fn() },
    inverter: { create: vi.fn() },
    supplierProduct: { create: vi.fn() },
  };
  return {
    tx,
    cookieGet: vi.fn(),
    redirect: vi.fn(),
    validateSession: vi.fn(),
    sync: vi.fn(),
    createInvitation: vi.fn(),
    unlink: vi.fn(),
    sendEmail: vi.fn(),
    saveFile: vi.fn(),
    validateUploadedFile: vi.fn(),
    db: {
      company: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
      companyUser: { findUnique: vi.fn() },
      pvModule: { findFirst: vi.fn() },
      inverter: { findFirst: vi.fn() },
      supplierProduct: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
      supplierInvitation: { deleteMany: vi.fn() },
      dossierJob: { findMany: vi.fn() },
      projectArrayConfig: { findMany: vi.fn() },
      projectArrayInverter: { findMany: vi.fn() },
      file: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: m.cookieGet }) }));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@dossipv/db', () => ({ db: m.db }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.validateSession };
});
vi.mock('@dossipv/email', () => ({ sendEmail: m.sendEmail, appUrl: (path: string) => `https://app.test${path}` }));
vi.mock('@dossipv/file-storage', () => ({ saveFile: m.saveFile, validateUploadedFile: m.validateUploadedFile, deleteFile: vi.fn() }));
vi.mock('../lib/sponsorship', async () => {
  const actual = await vi.importActual<typeof import('../lib/sponsorship')>('../lib/sponsorship');
  return { ...actual, syncSupplierInstallers: m.sync, createInvitation: m.createInvitation, unlinkInstaller: m.unlink };
});
vi.mock('../components/brand-mark', () => ({ BrandMark: () => null }));
vi.mock('../components/app-shell', () => ({ AppShell: () => null }));
vi.mock('../app/(app)/actions', () => ({ logoutAction: vi.fn(), endImpersonationAction: vi.fn() }));

import SupplierLayout from '../app/fournisseur/layout';
import AppLayout from '../app/(app)/layout';
import { addSupplierProductAction, removeSupplierProductAction, proposeSupplierProductAction } from '../app/fournisseur/produits/actions';
import { inviteInstallerAction, removeSponsoredInstallerAction, cancelInvitationAction } from '../app/fournisseur/installateurs/actions';
import { loadSupplierStats } from '../lib/supplier-stats';
import { SponsorshipError } from '../lib/sponsorship';
import { TERMS_VERSION } from '../lib/legal';

const user = { id: 'u1', companyId: 'sup1', email: 's@x.tn', fullName: 'Sami', role: 'OWNER' as const };

function signIn(kind: 'SUPPLIER' | 'INSTALLER' | null): void {
  if (kind === null) {
    m.cookieGet.mockReturnValue(undefined);
    return;
  }
  m.cookieGet.mockReturnValue({ value: 'tok' });
  m.validateSession.mockResolvedValue(user);
  m.db.company.findUnique.mockResolvedValue({ id: 'sup1', name: 'Solaire SA', kind, profileComplete: true });
  m.db.companyUser.findUnique.mockResolvedValue({ termsVersion: TERMS_VERSION });
}

beforeEach(() => {
  for (const fn of Object.values(m.db).flatMap((v) => (typeof v === 'object' ? Object.values(v) : [v]))) (fn as ReturnType<typeof vi.fn>).mockReset();
  for (const fn of [m.cookieGet, m.redirect, m.validateSession, m.sync, m.createInvitation, m.unlink, m.sendEmail, m.saveFile, m.validateUploadedFile, ...Object.values(m.tx).flatMap((v) => Object.values(v))]) fn.mockReset();
  // Like Next's redirect(): it never returns.
  m.redirect.mockImplementation((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  });
  m.db.$transaction.mockImplementation((fn: (tx: typeof m.tx) => Promise<unknown>) => fn(m.tx));
});

describe('routing by company kind', () => {
  it('the supplier layout sends anonymous visitors to /login', async () => {
    signIn(null);
    await expect(SupplierLayout({ children: null })).rejects.toThrow('REDIRECT /login');
  });

  it('the supplier layout sends an installer to /dashboard', async () => {
    signIn('INSTALLER');
    await expect(SupplierLayout({ children: null })).rejects.toThrow('REDIRECT /dashboard');
  });

  it('the supplier layout lets a supplier in', async () => {
    signIn('SUPPLIER');
    await SupplierLayout({ children: null });
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it('the installer layout sends a supplier to /fournisseur', async () => {
    signIn('SUPPLIER');
    await expect(AppLayout({ children: null })).rejects.toThrow('REDIRECT /fournisseur');
  });

  it('the installer layout keeps an installer', async () => {
    signIn('INSTALLER');
    await AppLayout({ children: null });
    expect(m.redirect).not.toHaveBeenCalled();
  });
});

describe('carried products', () => {
  beforeEach(() => signIn('SUPPLIER'));

  it('adds a published, sourced catalog panel and syncs the sponsored installers', async () => {
    m.db.pvModule.findFirst.mockResolvedValue({ id: 'mod1' });
    m.db.supplierProduct.findFirst.mockResolvedValue(null);

    expect(await addSupplierProductAction('PV_MODULE', 'mod1')).toBeUndefined();

    expect(m.db.pvModule.findFirst).toHaveBeenCalledWith({
      where: { id: 'mod1', ownerCompanyId: null, catalogStatus: 'PUBLISHED', datasheetSourceUrl: { not: null } },
      select: { id: true },
    });
    expect(m.db.supplierProduct.create).toHaveBeenCalledWith({ data: { supplierCompanyId: 'sup1', kind: 'PV_MODULE', pvModuleId: 'mod1' } });
    expect(m.sync).toHaveBeenCalledWith('sup1');
  });

  it('refuses an item that is not a published shared one', async () => {
    m.db.inverter.findFirst.mockResolvedValue(null);
    expect(await addSupplierProductAction('INVERTER', 'inv1')).toEqual({ error: expect.any(String) });
    expect(m.db.supplierProduct.create).not.toHaveBeenCalled();
    expect(m.sync).not.toHaveBeenCalled();
  });

  it('removes only its own product and syncs', async () => {
    m.db.supplierProduct.deleteMany.mockResolvedValue({ count: 1 });
    expect(await removeSupplierProductAction('p1')).toBeUndefined();
    expect(m.db.supplierProduct.deleteMany).toHaveBeenCalledWith({ where: { id: 'p1', supplierCompanyId: 'sup1' } });
    expect(m.sync).toHaveBeenCalledWith('sup1');
  });

  it('does not sync when nothing was removed', async () => {
    m.db.supplierProduct.deleteMany.mockResolvedValue({ count: 0 });
    expect(await removeSupplierProductAction('other')).toEqual({ error: 'Produit introuvable.' });
    expect(m.sync).not.toHaveBeenCalled();
  });
});

describe('proposing a product', () => {
  beforeEach(() => {
    signIn('SUPPLIER');
    m.validateUploadedFile.mockReturnValue({ valid: true, mimeType: 'application/pdf' });
    m.saveFile.mockResolvedValue({ storageKey: 'k1' });
    m.db.file.create.mockResolvedValue({ id: 'file1' });
    m.tx.pvModule.create.mockResolvedValue({ id: 'newmod' });
  });

  const panelForm = (extra: { datasheet?: boolean; url?: string } = {}): FormData => {
    const f = new FormData();
    const values: Record<string, string> = {
      brand: 'Jinko', model: 'Tiger 550', pmaxW: '550', vmpV: '41.8', impA: '13.2', vocV: '49.9', iscA: '13.9',
      tempCoeffVocPct: '-0.27', tempCoeffIscPct: '0.048', tempCoeffPmaxPct: '-0.35', irmA: '25', maxSystemVoltageV: '1500',
      lengthMm: '2278', widthMm: '1134', weightKg: '27',
    };
    for (const [k, v] of Object.entries(values)) f.set(k, v);
    if (extra.url !== '') f.set('datasheetSourceUrl', extra.url ?? 'https://jinko.example/ds.pdf');
    if (extra.datasheet !== false) f.set('datasheet', new File(['%PDF-1.4'], 'ds.pdf', { type: 'application/pdf' }));
    return f;
  };

  it('saves a DRAFT shared panel with its datasheet, carries it and redirects', async () => {
    await expect(proposeSupplierProductAction('PV_MODULE', undefined, panelForm())).rejects.toThrow('REDIRECT');

    const data = m.tx.pvModule.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ ownerCompanyId: null, catalogStatus: 'DRAFT', datasheetFileId: 'file1', datasheetSourceUrl: 'https://jinko.example/ds.pdf', brand: 'Jinko' });
    expect(m.tx.supplierProduct.create).toHaveBeenCalledWith({ data: { supplierCompanyId: 'sup1', kind: 'PV_MODULE', pvModuleId: 'newmod' } });
    expect(m.sync).toHaveBeenCalledWith('sup1');
    expect(m.redirect).toHaveBeenCalledWith('/fournisseur/produits?proposed=1');
  });

  it('requires the datasheet file', async () => {
    const result = await proposeSupplierProductAction('PV_MODULE', undefined, panelForm({ datasheet: false }));
    expect(result).toEqual({ error: expect.stringContaining('fiche technique') });
    expect(m.tx.pvModule.create).not.toHaveBeenCalled();
  });

  it('requires the manufacturer datasheet URL', async () => {
    const result = await proposeSupplierProductAction('PV_MODULE', undefined, panelForm({ url: '' }));
    expect(result).toEqual({ error: expect.any(String) });
    expect(m.tx.pvModule.create).not.toHaveBeenCalled();
    const bad = await proposeSupplierProductAction('PV_MODULE', undefined, panelForm({ url: 'not a url' }));
    expect(bad).toEqual({ error: expect.stringContaining('adresse web') });
  });

  it('refuses an unknown kind', async () => {
    expect(await proposeSupplierProductAction('CABLE', undefined, panelForm())).toEqual({ error: expect.any(String) });
  });
});

describe('sponsored installers', () => {
  beforeEach(() => signIn('SUPPLIER'));

  const emailForm = (email: string): FormData => {
    const f = new FormData();
    f.set('email', email);
    return f;
  };

  it('emails the invitation with the acceptance link', async () => {
    m.createInvitation.mockResolvedValue({ token: 'raw/token', email: 'inst@x.tn' });

    const result = await inviteInstallerAction(undefined, emailForm('Inst@x.tn'));

    expect(m.createInvitation).toHaveBeenCalledWith('sup1', 'Inst@x.tn');
    expect(result).toEqual({ sent: 'inst@x.tn' });
    const message = m.sendEmail.mock.calls[0]![0];
    expect(message.to).toBe('inst@x.tn');
    expect(message.action.url).toBe('https://app.test/invitation?token=raw%2Ftoken');
    expect(message.text).toContain('Solaire SA');
    expect(message.text).toContain('7 jours');
  });

  it('shows the SponsorshipError message and sends nothing', async () => {
    m.createInvitation.mockRejectedValue(new SponsorshipError('Votre pack est complet'));
    expect(await inviteInstallerAction(undefined, emailForm('a@b.tn'))).toEqual({ error: 'Votre pack est complet' });
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed address', async () => {
    expect(await inviteInstallerAction(undefined, emailForm('nope'))).toEqual({ error: expect.any(String) });
    expect(m.createInvitation).not.toHaveBeenCalled();
  });

  it('rejects an address that would address several recipients', async () => {
    for (const bad of ['x,evil@b.tn', 'a@b.tn,c@d.tn', '"x"@b.tn', 'Name <a@b.tn>']) {
      expect(await inviteInstallerAction(undefined, emailForm(bad))).toEqual({ error: expect.any(String) });
    }
    expect(m.createInvitation).not.toHaveBeenCalled();
  });

  it('unlinks only an installer this supplier sponsors', async () => {
    m.db.company.findFirst.mockResolvedValueOnce({ id: 'inst1' });
    expect(await removeSponsoredInstallerAction('inst1')).toBeUndefined();
    expect(m.db.company.findFirst).toHaveBeenCalledWith({ where: { id: 'inst1', sponsorCompanyId: 'sup1' }, select: { id: true } });
    expect(m.unlink).toHaveBeenCalledWith('inst1');

    m.db.company.findFirst.mockResolvedValueOnce(null);
    expect(await removeSponsoredInstallerAction('foreign')).toEqual({ error: expect.any(String) });
    expect(m.unlink).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending invitation of its own', async () => {
    await cancelInvitationAction('inv1');
    expect(m.db.supplierInvitation.deleteMany).toHaveBeenCalledWith({ where: { id: 'inv1', supplierCompanyId: 'sup1', acceptedAt: null } });
  });
});

describe('statistics', () => {
  it('counts distinct non-failed projects and exposes no personal data', async () => {
    m.db.company.findMany.mockResolvedValue([{ id: 'i1', name: 'Installateur Un' }, { id: 'i2', name: 'Installateur Deux' }]);
    m.db.supplierProduct.findMany.mockResolvedValue([
      { id: 'p1', pvModuleId: 'mod1', inverterId: null, pvModule: { brand: 'Jinko', model: 'T550' }, inverter: null },
      { id: 'p2', pvModuleId: null, inverterId: 'inv1', pvModule: null, inverter: { brand: 'Huawei', model: 'SUN2000' } },
    ]);
    // A project with two jobs counts once.
    m.db.dossierJob.findMany.mockResolvedValue([
      { projectId: 'pr1', project: { companyId: 'i1' } },
      { projectId: 'pr1', project: { companyId: 'i1' } },
      { projectId: 'pr2', project: { companyId: 'i2' } },
    ]);
    m.db.projectArrayConfig.findMany.mockResolvedValue([{ moduleId: 'mod1', projectId: 'pr1' }, { moduleId: 'mod1', projectId: 'pr2' }]);
    m.db.projectArrayInverter.findMany.mockResolvedValue([{ inverterId: 'inv1', arrayConfig: { projectId: 'pr1' } }, { inverterId: 'inv1', arrayConfig: { projectId: 'pr1' } }]);

    const stats = await loadSupplierStats('sup1');

    expect(stats.totalDossiersThisMonth).toBe(2);
    expect(stats.installers).toEqual([
      { id: 'i1', name: 'Installateur Un', dossiersThisMonth: 1 },
      { id: 'i2', name: 'Installateur Deux', dossiersThisMonth: 1 },
    ]);
    expect(stats.products.map((p) => [p.label, p.projects])).toEqual([['Jinko T550', 2], ['Huawei SUN2000', 1]]);

    // Nothing but counts and product/company names is selected: no client, CIN, address or STEG field.
    const queried = JSON.stringify([m.db.dossierJob.findMany.mock.calls, m.db.projectArrayConfig.findMany.mock.calls, m.db.projectArrayInverter.findMany.mock.calls]);
    expect(queried).not.toMatch(/client|cin|address|steg|inputSnapshot/i);
    expect(JSON.stringify(stats)).not.toMatch(/client|cin|address|steg/i);
  });
});
