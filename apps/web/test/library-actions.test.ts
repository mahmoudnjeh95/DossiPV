import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    inverterFindFirst: vi.fn(),
    spdFindMany: vi.fn(),
    upsert: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
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
      inverter: { findFirst: m.inverterFindFirst },
      spd: { findMany: m.spdFindMany },
      libraryItem: { upsert: m.upsert, createMany: m.createMany, deleteMany: m.deleteMany, updateMany: m.updateMany },
    },
  };
});

import {
  addToLibraryAction,
  addAllOfKindAction,
  removeFromLibraryAction,
  updateLibraryPriceAction,
} from '../app/(app)/library/actions';

function priceForm(value: string): FormData {
  const f = new FormData();
  f.set('price', value);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'token' });
  m.mockValidateSession.mockResolvedValue({ id: 'user-1', companyId: 'company-1', fullName: 'Test' });
});

describe('library actions', () => {
  it('guards before anything', async () => {
    m.mockGet.mockReturnValue(undefined);
    await expect(addToLibraryAction('INVERTER', 'inv-1')).rejects.toThrow('NEXT_REDIRECT:/login');
    await expect(addAllOfKindAction('SPD')).rejects.toThrow('NEXT_REDIRECT:/login');
    await expect(removeFromLibraryAction('li-1')).rejects.toThrow('NEXT_REDIRECT:/login');
    await expect(updateLibraryPriceAction('li-1', undefined, priceForm('10'))).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(m.inverterFindFirst).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.deleteMany).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('adds a published shared item', async () => {
    m.inverterFindFirst.mockResolvedValue({ id: 'inv-1' });
    const result = await addToLibraryAction('INVERTER', 'inv-1');
    expect(result).toBeUndefined();
    const lookup = m.inverterFindFirst.mock.calls[0]?.[0] as { where: unknown };
    expect(lookup.where).toEqual({
      id: 'inv-1',
      OR: [{ ownerCompanyId: null, catalogStatus: 'PUBLISHED' }, { ownerCompanyId: 'company-1' }],
    });
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { companyId: 'company-1', kind: 'INVERTER', inverterId: 'inv-1' }, update: {} }),
    );
    expect(m.mockRevalidatePath).toHaveBeenCalledWith('/library');
  });

  it('refuses an unsourced shared item', async () => {
    m.inverterFindFirst.mockResolvedValueOnce({ id: 'inv-1' }).mockResolvedValueOnce(null);
    const result = await addToLibraryAction('INVERTER', 'inv-1');
    expect(result).toEqual({ error: 'Équipement sans fiche technique source : non disponible.' });
    const check = m.inverterFindFirst.mock.calls[1]?.[0] as { where: unknown };
    expect(check.where).toEqual({
      id: 'inv-1',
      OR: [{ datasheetSourceUrl: { not: null } }, { ownerCompanyId: 'company-1' }],
    });
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("allows the company's own item without a source", async () => {
    m.inverterFindFirst.mockResolvedValue({ id: 'inv-own' });
    expect(await addToLibraryAction('INVERTER', 'inv-own')).toBeUndefined();
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it("refuses a draft or another company's private item", async () => {
    m.inverterFindFirst.mockResolvedValue(null);
    const result = await addToLibraryAction('INVERTER', 'inv-x');
    expect(result).toEqual({ error: 'Équipement introuvable dans le catalogue.' });
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('adds every published shared SPD not yet in the library', async () => {
    m.spdFindMany.mockResolvedValue([{ id: 'spd-2' }, { id: 'spd-3' }]);
    const result = await addAllOfKindAction('SPD');
    expect(result).toBeUndefined();
    const query = m.spdFindMany.mock.calls[0]?.[0] as { where: unknown };
    expect(query.where).toEqual({
      ownerCompanyId: null,
      catalogStatus: 'PUBLISHED',
      datasheetSourceUrl: { not: null },
      libraryItems: { none: { companyId: 'company-1' } },
    });
    expect(m.createMany).toHaveBeenCalledWith({
      data: [
        { companyId: 'company-1', kind: 'SPD', spdId: 'spd-2' },
        { companyId: 'company-1', kind: 'SPD', spdId: 'spd-3' },
      ],
      skipDuplicates: true,
    });
    expect(m.mockRevalidatePath).toHaveBeenCalledWith('/library');
  });

  it('removes only the caller own item', async () => {
    m.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await removeFromLibraryAction('li-1')).toBeUndefined();
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: 'li-1', companyId: 'company-1' } });
    expect(m.mockRevalidatePath).toHaveBeenCalledWith('/library');
    expect(await removeFromLibraryAction('li-other')).toEqual({ error: 'Élément introuvable.' });
  });

  it('updates the price of the caller own item, scoped by company', async () => {
    m.updateMany.mockResolvedValue({ count: 1 });
    expect(await updateLibraryPriceAction('li-1', undefined, priceForm('125,5'))).toBeUndefined();
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { id: 'li-1', companyId: 'company-1' },
      data: { purchasePriceTnd: 125.5 },
    });
    m.updateMany.mockResolvedValue({ count: 0 });
    expect(await updateLibraryPriceAction('li-2', undefined, priceForm('10'))).toEqual({ error: 'Élément introuvable.' });
  });

  it('rejects a negative, empty or oversized price', async () => {
    for (const bad of ['-1', '', 'abc', '1000001']) {
      expect(await updateLibraryPriceAction('li-1', undefined, priceForm(bad))).toEqual({ error: 'Prix invalide.' });
    }
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
