import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { CatalogInverter, CatalogModule, Proposal, ProposeResult } from '@dossipv/engine';
import { sizingCatalog, sizingContext } from '../../../packages/engine/test/fixtures/sizing-catalog';
import { buildFullProject } from './fixtures/full-project';
import type { ProjectForEngine } from '../lib/project-engine-input';

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
    mockTransaction: vi.fn(),
    mockGetSpecificYield: vi.fn(),
    mockLoadSizingCatalog: vi.fn(),
    mockLoadHighlightedSizingItems: vi.fn(),
    mockLoadHighlighted: vi.fn(),
    mockIsSponsored: vi.fn(),
    mockRecordStat: vi.fn(),
    mockPropose: vi.fn(),
    tx: {
      libraryItem: { upsert: vi.fn() },
      projectArrayConfig: { findUnique: vi.fn(), delete: vi.fn(), create: vi.fn() },
      projectArrayInverter: { deleteMany: vi.fn() },
      projectArrayMppt: { deleteMany: vi.fn() },
      projectProtections: { upsert: vi.fn() },
      projectCablingConfig: { upsert: vi.fn() },
      projectCableRun: { deleteMany: vi.fn(), createMany: vi.fn() },
      projectStructure: { upsert: vi.fn() },
      projectEarthing: { upsert: vi.fn() },
      projectSimulation: { upsert: vi.fn() },
      project: { update: vi.fn() },
    },
  };
});

vi.mock('next/headers', () => ({ cookies: m.mockCookies }));
vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('@dossipv/auth', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/auth')>('@dossipv/auth');
  return { ...actual, validateSession: m.mockValidateSession };
});
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, company: { findUnique: () => Promise.resolve({ kind: 'INSTALLER' }) }, project: { findFirst: m.mockProjectFindFirst }, $transaction: m.mockTransaction } };
});
vi.mock('@dossipv/engine', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/engine')>('@dossipv/engine');
  return { ...actual, proposeInstallations: m.mockPropose };
});
vi.mock('../lib/specific-yield', () => ({ getSpecificYield: m.mockGetSpecificYield }));
vi.mock('../lib/sizing-catalog', async () => {
  const actual = await vi.importActual<typeof import('../lib/sizing-catalog')>('../lib/sizing-catalog');
  return { ...actual, loadSizingCatalog: m.mockLoadSizingCatalog, loadHighlightedSizingItems: m.mockLoadHighlightedSizingItems };
});
vi.mock('../lib/highlight', async () => {
  const actual = await vi.importActual<typeof import('../lib/highlight')>('../lib/highlight');
  return { ...actual, loadHighlightedProducts: m.mockLoadHighlighted, recordProductStat: m.mockRecordStat };
});
vi.mock('../lib/sponsorship', async () => {
  const actual = await vi.importActual<typeof import('../lib/sponsorship')>('../lib/sponsorship');
  return { ...actual, isSponsored: m.mockIsSponsored };
});

import { applyProposalAction } from '../app/(app)/projects/[id]/proposals/actions';
import { ProposalCard } from '../app/(app)/projects/[id]/proposals/proposal-card';
import { withHighlights, type LibrarySection } from '../app/(app)/library/library-data';
import { SponsoredBadge } from '../components/sponsored-badge';
import { highlightedFirst } from '../lib/highlight';
import { computeProjectProposals } from '../lib/project-proposals';

const user = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };
const NOW = new Date('2026-10-21T10:00:00Z');

function billProject(): ProjectForEngine {
  const base = buildFullProject();
  return {
    ...base,
    id: 'p1',
    flowStep: 'PROPOSALS',
    company: { ...base.company, anmeValidTo: new Date('2028-01-01') },
    client: { ...base.client!, projectId: 'p1', annualConsumptionKWh: 3000, subscribedPowerKVA: 4 },
    arrayConfig: null,
    protections: null,
    cablingConfig: null,
    cableRuns: [],
    structure: null,
    earthing: null,
    simulation: null,
  };
}

const libModule = sizingCatalog.modules[0]!;
const libInverter = sizingCatalog.inverters[0]!;
const hlModule: CatalogModule = { ...libModule, id: 'hl-module', brand: 'Sun', model: 'S1' };
const hlInverter: CatalogInverter = { ...libInverter, id: 'hl-inverter', brand: 'Sun', model: 'I1' };

// A real proposal from the real engine: the sponsored one is the same figures on the highlighted equipment.
let normalProposal: Proposal;
let sponsoredProposal: Proposal;

/** The engine mock: the sponsored pass is recognised by its highlighted panel. */
function engineReturns(normal: Proposal[], sponsoredPass: Proposal[]): void {
  m.mockPropose.mockImplementation((catalog: { modules: CatalogModule[] }): ProposeResult => {
    const proposals = catalog.modules.some((mod) => mod.id === 'hl-module') ? sponsoredPass : normal;
    return { proposals, noSolutionReasons: [], stats: { combinations: 1, engineRuns: 1 } };
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  const engine = await vi.importActual<typeof import('@dossipv/engine')>('@dossipv/engine');
  const real = engine.proposeInstallations(sizingCatalog, sizingContext).proposals[0]!;
  normalProposal = { ...real, kinds: ['RECOMMENDED'] };
  sponsoredProposal = {
    ...real,
    key: 'hl-module|hl-inverter|8x1',
    kinds: ['RECOMMENDED', 'ECONOMIC'],
    candidate: { ...real.candidate, module: hlModule, inverter: hlInverter },
  };
  m.mockGet.mockReturnValue({ value: 'valid-token' });
  m.mockValidateSession.mockResolvedValue(user);
  m.mockProjectFindFirst.mockImplementation((args: { select?: unknown }) =>
    Promise.resolve(args.select ? { id: 'p1', companyId: 'company-1', tier: 'STANDARD', status: 'DRAFT' } : billProject()),
  );
  m.mockGetSpecificYield.mockResolvedValue({ value: 1600, warning: null });
  m.mockLoadSizingCatalog.mockResolvedValue(sizingCatalog);
  m.mockIsSponsored.mockResolvedValue(false);
  m.mockLoadHighlighted.mockResolvedValue({
    moduleIds: ['hl-module'],
    inverterIds: ['hl-inverter'],
    suppliers: { 'hl-module': ['SolarTN'], 'hl-inverter': ['SolarTN', 'SunSfax'] },
    productIds: { 'hl-module': ['sp-1'], 'hl-inverter': ['sp-2', 'sp-3'] },
  });
  m.mockLoadHighlightedSizingItems.mockImplementation((moduleIds: string[], inverterIds: string[]) =>
    Promise.resolve({
      modules: moduleIds.includes('hl-module') ? [hlModule] : [],
      inverters: inverterIds.includes('hl-inverter') ? [hlInverter] : [],
    }),
  );
  m.mockTransaction.mockImplementation((fn: (tx: typeof m.tx) => Promise<unknown>) => fn(m.tx));
  m.tx.projectArrayConfig.findUnique.mockResolvedValue(null);
  engineReturns([normalProposal], [sponsoredProposal]);
});

afterEach(cleanup);

type EngineCall = [{ modules: { id: string }[]; inverters: unknown[] }];
const sponsoredCall = (): EngineCall[0] => (m.mockPropose.mock.calls as EngineCall[]).find(([c]) => c.modules[0]?.id === 'hl-module')![0];

describe('computeProjectProposals: sponsored pass', () => {
  it('runs a second sizing on the highlighted panels and inverters, the other kinds from the library', async () => {
    const computed = await computeProjectProposals(billProject(), NOW);

    expect(computed.ok).toBe(true);
    if (!computed.ok) return;
    expect(m.mockPropose).toHaveBeenCalledTimes(2);
    const catalog = sponsoredCall() as unknown as typeof sizingCatalog;
    expect(catalog.modules).toEqual([hlModule]);
    expect(catalog.inverters).toEqual([hlInverter]);
    expect(catalog.acBreakers).toBe(sizingCatalog.acBreakers);
    expect(catalog.cables).toBe(sizingCatalog.cables);
    // The normal pass is untouched and still lists the library only.
    expect(computed.result.proposals).toEqual([normalProposal]);
    expect(computed.sponsored).toEqual({
      proposal: sponsoredProposal,
      suppliers: ['SolarTN', 'SunSfax'],
      productIds: ['sp-1', 'sp-2', 'sp-3'],
    });
  });

  it('shows nothing sponsored without highlighted products', async () => {
    m.mockLoadHighlighted.mockResolvedValue({ moduleIds: [], inverterIds: [], suppliers: {}, productIds: {} });

    const computed = await computeProjectProposals(billProject(), NOW);

    expect(computed.ok && computed.sponsored).toBeFalsy();
    expect(m.mockPropose).toHaveBeenCalledTimes(1);
  });

  it('never runs for a sponsored installer', async () => {
    m.mockIsSponsored.mockResolvedValue(true);

    const computed = await computeProjectProposals(billProject(), NOW);

    expect(computed.ok && computed.sponsored).toBeFalsy();
    expect(m.mockLoadHighlighted).not.toHaveBeenCalled();
    expect(m.mockPropose).toHaveBeenCalledTimes(1);
  });

  it('shows nothing sponsored when the sponsored pass has no RECOMMENDED result, and the normal proposals stay', async () => {
    engineReturns([normalProposal], [{ ...sponsoredProposal, kinds: ['ECONOMIC'] }]);
    const noRecommended = await computeProjectProposals(billProject(), NOW);
    engineReturns([normalProposal], []);
    const empty = await computeProjectProposals(billProject(), NOW);

    for (const computed of [noRecommended, empty]) {
      expect(computed.ok && computed.sponsored).toBeFalsy();
      expect(computed.ok && computed.result.proposals).toEqual([normalProposal]);
    }
  });

  it('keeps the normal proposals when loading the highlighted products fails', async () => {
    m.mockLoadHighlighted.mockRejectedValue(new Error('db down'));

    const computed = await computeProjectProposals(billProject(), NOW);

    expect(computed.ok && computed.sponsored).toBeFalsy();
    expect(computed.ok && computed.result.proposals).toEqual([normalProposal]);
  });

  it('respects a fixed panel only when it is highlighted, else skips the sponsored pass', async () => {
    const skipped = await computeProjectProposals(billProject(), NOW, { moduleId: libModule.id });
    expect(skipped.ok && skipped.sponsored).toBeFalsy();
    expect(m.mockPropose).toHaveBeenCalledTimes(1);

    const kept = await computeProjectProposals(billProject(), NOW, { moduleId: 'hl-module' });
    expect(kept.ok && kept.sponsored?.proposal).toEqual(sponsoredProposal);
    expect(m.mockLoadHighlightedSizingItems).toHaveBeenLastCalledWith(['hl-module'], ['hl-inverter']);
  });

  it('keeps the library for a kind nobody highlights', async () => {
    m.mockLoadHighlighted.mockResolvedValue({
      moduleIds: ['hl-module'],
      inverterIds: [],
      suppliers: { 'hl-module': ['SolarTN'] },
      productIds: { 'hl-module': ['sp-1'] },
    });
    engineReturns([normalProposal], [{ ...sponsoredProposal, candidate: { ...sponsoredProposal.candidate, inverter: libInverter } }]);

    const computed = await computeProjectProposals(billProject(), NOW);

    expect(sponsoredCall().inverters).toBe(sizingCatalog.inverters);
    expect(computed.ok && computed.sponsored?.suppliers).toEqual(['SolarTN']);
  });
});

describe('applyProposalAction: sponsored proposal', () => {
  it('adds its panel and inverter to the library, applies it and counts the application', async () => {
    await expect(applyProposalAction('p1', sponsoredProposal.key, {}, true)).rejects.toThrow('NEXT_REDIRECT:/projects/p1/locations');

    expect(m.tx.libraryItem.upsert).toHaveBeenCalledWith({
      where: { companyId_pvModuleId: { companyId: 'company-1', pvModuleId: 'hl-module' } },
      create: { companyId: 'company-1', kind: 'PV_MODULE', pvModuleId: 'hl-module' },
      update: {},
    });
    expect(m.tx.libraryItem.upsert).toHaveBeenCalledWith({
      where: { companyId_inverterId: { companyId: 'company-1', inverterId: 'hl-inverter' } },
      create: { companyId: 'company-1', kind: 'INVERTER', inverterId: 'hl-inverter' },
      update: {},
    });
    expect(m.tx.libraryItem.upsert.mock.invocationCallOrder[0]!).toBeLessThan(m.tx.projectArrayConfig.create.mock.invocationCallOrder[0]!);
    expect((m.tx.projectArrayConfig.create.mock.calls[0]![0] as { data: { moduleId: string } }).data.moduleId).toBe('hl-module');
    expect(m.mockRecordStat).toHaveBeenCalledWith(['sp-1', 'sp-2', 'sp-3'], 'applied');
  });

  it('refuses a sponsored key that is no longer proposed, without writing', async () => {
    const result = await applyProposalAction('p1', 'hl-module|hl-inverter|99x9', {}, true);

    expect(result).toEqual({ error: 'Les propositions ont changé : rechargez la page.' });
    expect(m.mockTransaction).not.toHaveBeenCalled();
  });

  it('does not take a normal key for the sponsored list, and a normal proposal writes no library item', async () => {
    expect(await applyProposalAction('p1', normalProposal.key, {}, true)).toEqual({ error: 'Les propositions ont changé : rechargez la page.' });

    await expect(applyProposalAction('p1', normalProposal.key)).rejects.toThrow('NEXT_REDIRECT');
    expect(m.tx.libraryItem.upsert).not.toHaveBeenCalled();
    expect(m.mockRecordStat).not.toHaveBeenCalled();
  });
});

describe('badges and order', () => {
  it('a sponsored card always shows the badge, the title and the supplier line', () => {
    render(<ProposalCard projectId="p1" proposal={sponsoredProposal} sponsoredBy={['SolarTN', 'SunSfax']} />);

    expect(screen.getByRole('heading', { name: 'Proposition sponsorisée' })).toBeTruthy();
    expect(screen.getByText('Sponsorisé')).toBeTruthy();
    expect(screen.getByText('Mis en avant par SolarTN, SunSfax ; les vérifications techniques sont identiques.')).toBeTruthy();
  });

  it('a normal card shows no sponsored label', () => {
    render(<ProposalCard projectId="p1" proposal={normalProposal} />);

    expect(screen.queryByText('Sponsorisé')).toBeNull();
    expect(screen.queryByText('Proposition sponsorisée')).toBeNull();
  });

  it('the badge carries the supplier in its tooltip', () => {
    render(<SponsoredBadge suppliers={['SolarTN', 'SunSfax']} />);

    expect(screen.getByText('Sponsorisé').getAttribute('title')).toBe('Mis en avant par SolarTN, SunSfax');
  });

  it('puts highlighted panels and inverters first in the catalog, with their suppliers, and leaves other kinds alone', () => {
    const row = (itemId: string): LibrarySection['rows'][number] => ({ itemId, label: itemId, figures: '', libraryItemId: null, priceTnd: 0, own: false });
    const sections: LibrarySection[] = [
      { kind: 'PV_MODULE', title: 'Modules', bulk: false, rows: [row('a'), row('b'), row('c')] },
      { kind: 'INVERTER', title: 'Onduleurs', bulk: false, rows: [row('x'), row('y')] },
      { kind: 'SPD', title: 'Parafoudres', bulk: true, rows: [row('b'), row('s')] },
    ];

    const result = withHighlights(sections, { moduleIds: ['c', 'b'], inverterIds: [], suppliers: { c: ['SolarTN'], b: ['SunSfax'] }, productIds: {} });

    expect(result[0]!.rows.map((r) => [r.itemId, r.sponsoredBy])).toEqual([
      ['c', ['SolarTN']],
      ['b', ['SunSfax']],
      ['a', undefined],
    ]);
    expect(result[1]).toBe(sections[1]);
    expect(result[2]).toBe(sections[2]);
  });

  it('orders the dropdown options with highlightedFirst', () => {
    expect(highlightedFirst([{ id: 'a' }, { id: 'b' }, { id: 'c' }], ['c']).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });
});
