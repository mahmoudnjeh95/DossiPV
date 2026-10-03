import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockSubscriptionUpdate, mockPaymentCreate } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockSubscriptionUpdate: vi.fn(),
  mockPaymentCreate: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      subscription: { update: mockSubscriptionUpdate },
      payment: { create: mockPaymentCreate },
    },
  };
});

import {
  suspendSubscriptionAction,
  activateSubscriptionAction,
  recordPaymentAction,
  updatePeriodEndAction,
} from '../app/admin/(protected)/installers/[id]/actions';

beforeEach(() => {
  mockRedirect.mockClear();
  mockSubscriptionUpdate.mockClear();
  mockPaymentCreate.mockClear();
});

describe('suspendSubscriptionAction', () => {
  it('sets the subscription status to SUSPENDED and redirects back to the detail page', async () => {
    mockSubscriptionUpdate.mockResolvedValue({});

    await suspendSubscriptionAction('company-1');

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { status: 'SUSPENDED' } });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});

describe('activateSubscriptionAction', () => {
  it('sets the subscription status to ACTIVE and redirects back to the detail page', async () => {
    mockSubscriptionUpdate.mockResolvedValue({});

    await activateSubscriptionAction('company-1');

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({ where: { companyId: 'company-1' }, data: { status: 'ACTIVE' } });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});

describe('recordPaymentAction', () => {
  it('creates a Payment row with recordedByAdmin true and redirects back', async () => {
    mockPaymentCreate.mockResolvedValue({});

    const formData = new FormData();
    formData.set('amountTnd', '150.00');
    formData.set('method', 'MANUAL');
    formData.set('note', 'Paiement en espèces');

    await recordPaymentAction('company-1', undefined, formData);

    expect(mockPaymentCreate).toHaveBeenCalledWith({
      data: { companyId: 'company-1', amountTnd: 150, method: 'MANUAL', note: 'Paiement en espèces', recordedByAdmin: true },
    });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });

  it('rejects a non-numeric amount without creating a Payment row', async () => {
    const formData = new FormData();
    formData.set('amountTnd', 'not-a-number');
    formData.set('method', 'MANUAL');

    const result = await recordPaymentAction('company-1', undefined, formData);

    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Montant invalide.' });
  });

  it('rejects a negative amount without creating a Payment row', async () => {
    const formData = new FormData();
    formData.set('amountTnd', '-50');
    formData.set('method', 'MANUAL');

    const result = await recordPaymentAction('company-1', undefined, formData);

    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Montant invalide.' });
  });
});

describe('updatePeriodEndAction', () => {
  it('updates the subscription periodEnd and redirects back', async () => {
    mockSubscriptionUpdate.mockResolvedValue({});

    const formData = new FormData();
    formData.set('periodEnd', '2027-01-01');

    await updatePeriodEndAction('company-1', formData);

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      data: { periodEnd: new Date('2027-01-01') },
    });
    expect(mockRedirect).toHaveBeenCalledWith('/admin/installers/company-1');
  });
});
