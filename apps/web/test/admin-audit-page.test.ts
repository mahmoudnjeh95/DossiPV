import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ mockFindMany: vi.fn() }));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, adminAuditLog: { findMany: m.mockFindMany } } };
});

import { loadAuditPage } from '../app/admin/(protected)/audit/page';
import { describeAuditDetails } from '../lib/admin-audit';

function rows(count: number): { id: string }[] {
  return Array.from({ length: count }, (_, index) => ({ id: `entry-${index}` }));
}

beforeEach(() => {
  m.mockFindMany.mockReset();
});

describe('loadAuditPage', () => {
  it('reads the latest 100 entries, newest first, and gives the cursor of an older page', async () => {
    m.mockFindMany.mockResolvedValue(rows(101));

    const page = await loadAuditPage({});

    const query = m.mockFindMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query.where).toEqual({});
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(query.take).toBe(101);
    expect(query.cursor).toBeUndefined();
    expect(page.entries).toHaveLength(100);
    expect(page.nextBefore).toBe('entry-99');
  });

  it("filters by company and starts after the previous page's last entry", async () => {
    m.mockFindMany.mockResolvedValue(rows(3));

    const page = await loadAuditPage({ company: 'company-1', before: 'entry-99' });

    const query = m.mockFindMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query.where).toEqual({ targetCompanyId: 'company-1' });
    expect(query.cursor).toEqual({ id: 'entry-99' });
    expect(query.skip).toBe(1);
    expect(page.entries).toHaveLength(3);
    expect(page.nextBefore).toBeNull();
  });
});

describe('describeAuditDetails', () => {
  it('names the values in French, leaves out ids and empty values, and formats booleans and dates', () => {
    expect(describeAuditDetails({ userId: 'user-2', email: 'a@b.tn', sent: false, note: null, periodEnd: '2027-01-01' })).toBe(
      'email : a@b.tn, envoyé : non, fin de période : 01/01/2027',
    );
  });

  it('shows a dash for empty details', () => {
    expect(describeAuditDetails({})).toBe('—');
    expect(describeAuditDetails({ planId: 'plan-1' })).toBe('—');
    expect(describeAuditDetails(null)).toBe('—');
  });
});
