/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-function-return-type, @typescript-eslint/require-await -- mocked modules of loosely typed call arguments */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  validateSuperAdminSession: vi.fn(),
  upsert: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'admin-token' }) })) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@dossipv/auth', () => ({ validateSuperAdminSession: m.validateSuperAdminSession }));
vi.mock('@dossipv/db', () => ({ db: { platformSettings: { upsert: m.upsert }, adminAuditLog: { create: m.auditCreate } } }));

import { updateInvoicingSettingsAction } from '../app/admin/(protected)/settings/actions';

function form(overrides: Record<string, string> = {}): FormData {
  const fields: Record<string, string> = {
    sellerLegalName: 'SOLARIX PRO SARL',
    sellerTaxId: '1234567/A/M/000',
    sellerAddress: '12 rue de la Liberté, Tunis',
    sellerPhone: '71000000',
    sellerEmail: 'facturation@dossipv.tn',
    vatRatePct: '19',
    stampDutyTnd: '1.000',
    invoiceFooter: 'Merci',
    ...overrides,
  };
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

beforeEach(() => {
  for (const mock of [m.validateSuperAdminSession, m.upsert, m.auditCreate]) mock.mockReset();
  m.validateSuperAdminSession.mockResolvedValue({ id: 'admin-1', email: 'a@b.tn' });
});

describe('updateInvoicingSettingsAction', () => {
  it('saves the seller, VAT and stamp, and logs settings.invoicing', async () => {
    const result = await updateInvoicingSettingsAction(undefined, form());
    expect(result).toEqual({ saved: true });
    expect(m.upsert).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      create: expect.objectContaining({ id: 'singleton', sellerLegalName: 'SOLARIX PRO SARL', vatRatePct: 19, stampDutyTnd: 1 }),
      update: expect.objectContaining({ sellerTaxId: '1234567/A/M/000', invoiceFooter: 'Merci' }),
    });
    expect(m.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ superAdminId: 'admin-1', action: 'settings.invoicing', targetCompanyId: null }),
    });
  });

  it('stores optional fields left empty as null', async () => {
    await updateInvoicingSettingsAction(undefined, form({ sellerAddress: '', sellerPhone: '', sellerEmail: '', invoiceFooter: '' }));
    expect(m.upsert.mock.calls[0]![0].update).toMatchObject({ sellerAddress: null, sellerPhone: null, sellerEmail: null, invoiceFooter: null });
  });

  it.each([
    ['a missing legal name', { sellerLegalName: '' }, /Raison sociale/],
    ['a missing matricule fiscal', { sellerTaxId: '' }, /Matricule fiscal/],
    ['a malformed matricule fiscal', { sellerTaxId: '12' }, /Matricule fiscal : format invalide/],
    ['a matricule with forbidden characters', { sellerTaxId: '1234<script>' }, /format invalide/],
    ['a VAT rate above 100', { vatRatePct: '101' }, /TVA/],
    ['a negative VAT rate', { vatRatePct: '-1' }, /TVA/],
    ['a non-numeric VAT rate', { vatRatePct: 'abc' }, /TVA/],
    ['a negative stamp duty', { stampDutyTnd: '-1' }, /timbre/],
    ['an invalid email', { sellerEmail: 'not-an-email' }, /Email/],
  ])('refuses %s without saving', async (_label, overrides, message) => {
    const result = await updateInvoicingSettingsAction(undefined, form(overrides));
    expect(result?.error).toMatch(message);
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it('accepts the bounds 0 and 100 for the VAT rate', async () => {
    expect(await updateInvoicingSettingsAction(undefined, form({ vatRatePct: '0' }))).toEqual({ saved: true });
    expect(await updateInvoicingSettingsAction(undefined, form({ vatRatePct: '100' }))).toEqual({ saved: true });
  });
});
