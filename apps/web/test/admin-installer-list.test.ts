import { describe, it, expect } from 'vitest';
import { shapeInstallerRow, type CompanyWithRelationsForList } from '../app/admin/(protected)/installers/page';

function makeCompany(overrides: Partial<CompanyWithRelationsForList> = {}): CompanyWithRelationsForList {
  return {
    id: 'company-1',
    name: 'Solar Co',
    subscription: null,
    users: [],
    projects: [],
    ...overrides,
  };
}

describe('shapeInstallerRow', () => {
  const now = new Date('2026-10-15T00:00:00Z');

  it('shows "Aucun abonnement" and no expiry highlight when subscription is null', () => {
    const row = shapeInstallerRow(makeCompany({ subscription: null }), now);

    expect(row.planName).toBe('Aucun abonnement');
    expect(row.isExpiringOrExpired).toBe(false);
  });

  it('highlights a subscription expiring within 7 days', () => {
    const row = shapeInstallerRow(
      makeCompany({
        subscription: {
          status: 'ACTIVE',
          periodEnd: new Date('2026-10-18T00:00:00Z'),
          plan: { name: 'Standard' },
        },
      }),
      now,
    );

    expect(row.isExpiringOrExpired).toBe(true);
  });

  it('highlights an already-expired subscription even if status is still ACTIVE', () => {
    const row = shapeInstallerRow(
      makeCompany({
        subscription: {
          status: 'ACTIVE',
          periodEnd: new Date('2026-09-01T00:00:00Z'),
          plan: { name: 'Standard' },
        },
      }),
      now,
    );

    expect(row.isExpiringOrExpired).toBe(true);
  });

  it('does not highlight a subscription with more than 7 days remaining', () => {
    const row = shapeInstallerRow(
      makeCompany({
        subscription: {
          status: 'ACTIVE',
          periodEnd: new Date('2026-11-01T00:00:00Z'),
          plan: { name: 'Standard' },
        },
      }),
      now,
    );

    expect(row.isExpiringOrExpired).toBe(false);
  });

  it("counts only this-month dossier jobs across all of the company's projects", () => {
    const row = shapeInstallerRow(
      makeCompany({
        projects: [
          { jobs: [{ startedAt: new Date('2026-10-01T00:00:00Z') }, { startedAt: new Date('2026-09-15T00:00:00Z') }] },
          { jobs: [{ startedAt: new Date('2026-10-10T00:00:00Z') }] },
        ],
      }),
      now,
    );

    expect(row.dossiersThisMonth).toBe(2);
  });

  it('derives last login as the most recent session createdAt across all users', () => {
    const row = shapeInstallerRow(
      makeCompany({
        users: [
          { sessions: [{ createdAt: new Date('2026-10-01T00:00:00Z') }] },
          { sessions: [{ createdAt: new Date('2026-10-14T00:00:00Z') }] },
        ],
      }),
      now,
    );

    expect(row.lastLogin).toEqual(new Date('2026-10-14T00:00:00Z'));
  });

  it('shows null last login when no user has ever had a session', () => {
    const row = shapeInstallerRow(makeCompany({ users: [{ sessions: [] }] }), now);

    expect(row.lastLogin).toBeNull();
  });
});
