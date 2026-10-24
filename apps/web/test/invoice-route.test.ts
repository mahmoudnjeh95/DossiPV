/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/require-await -- mocked modules of loosely typed call arguments */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  validateSession: vi.fn(),
  validateSuperAdminSession: vi.fn(),
  invoiceFindUnique: vi.fn(),
  fileFindUnique: vi.fn(),
  regenerate: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: (name: string) => (m.cookies[name] ? { value: m.cookies[name] } : undefined) })),
}));
vi.mock('fs/promises', () => ({ readFile: m.readFile, default: { readFile: m.readFile } }));
vi.mock('@dossipv/auth', () => ({ validateSession: m.validateSession, validateSuperAdminSession: m.validateSuperAdminSession }));
vi.mock('@dossipv/file-storage', () => ({ getFilePath: (key: string) => `/files/${key}` }));
vi.mock('@dossipv/db', () => ({ db: { invoice: { findUnique: m.invoiceFindUnique }, file: { findUnique: m.fileFindUnique } } }));
vi.mock('../lib/invoices', () => ({
  invoiceDownloadName: (number: string) => `Facture-${number}.pdf`,
  regenerateInvoicePdf: m.regenerate,
}));

import { GET } from '../app/factures/[invoiceId]/route';

const INVOICE = { id: 'inv-1', number: '2026-0001', companyId: 'company-1', pdfFile: { storageKey: 'k.pdf' } };

function call(): Promise<Response> {
  return GET(new Request('http://localhost/factures/inv-1'), { params: Promise.resolve({ invoiceId: 'inv-1' }) });
}

beforeEach(() => {
  m.cookies = {};
  for (const mock of [m.validateSession, m.validateSuperAdminSession, m.invoiceFindUnique, m.fileFindUnique, m.regenerate, m.readFile]) {
    mock.mockReset();
  }
  m.validateSession.mockResolvedValue(null);
  m.validateSuperAdminSession.mockResolvedValue(null);
  m.invoiceFindUnique.mockResolvedValue(INVOICE);
  m.readFile.mockResolvedValue(Buffer.from('%PDF-1.7'));
});

describe('GET /factures/[invoiceId]', () => {
  it('refuses an anonymous visitor', async () => {
    expect((await call()).status).toBe(401);
    expect(m.invoiceFindUnique).not.toHaveBeenCalled();
  });

  it('streams the PDF to the company that owns the invoice', async () => {
    m.cookies.dossipv_session = 'token';
    m.validateSession.mockResolvedValue({ id: 'u1', companyId: 'company-1' });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('Facture-2026-0001.pdf');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('%PDF-1.7');
  });

  it('answers 404 to another company, without revealing the invoice', async () => {
    m.cookies.dossipv_session = 'token';
    m.validateSession.mockResolvedValue({ id: 'u2', companyId: 'company-2' });
    expect((await call()).status).toBe(404);
    expect(m.readFile).not.toHaveBeenCalled();
  });

  it('lets a super admin download any invoice', async () => {
    m.cookies.dossipv_admin_session = 'admin-token';
    m.validateSuperAdminSession.mockResolvedValue({ id: 'admin-1' });
    expect((await call()).status).toBe(200);
  });

  it('answers 404 for an unknown invoice', async () => {
    m.cookies.dossipv_admin_session = 'admin-token';
    m.validateSuperAdminSession.mockResolvedValue({ id: 'admin-1' });
    m.invoiceFindUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it('regenerates the PDF on the fly when it is missing', async () => {
    m.cookies.dossipv_session = 'token';
    m.validateSession.mockResolvedValue({ id: 'u1', companyId: 'company-1' });
    m.invoiceFindUnique.mockResolvedValue({ ...INVOICE, pdfFile: null });
    m.regenerate.mockResolvedValue('file-9');
    m.fileFindUnique.mockResolvedValue({ storageKey: 'new.pdf' });
    const response = await call();
    expect(m.regenerate).toHaveBeenCalledWith('inv-1');
    expect(response.status).toBe(200);
  });

  it('regenerates when the stored file cannot be read, and fails with 500 if that fails too', async () => {
    m.cookies.dossipv_session = 'token';
    m.validateSession.mockResolvedValue({ id: 'u1', companyId: 'company-1' });
    m.readFile.mockRejectedValue(new Error('ENOENT'));
    m.regenerate.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await call()).status).toBe(500);
    expect(m.regenerate).toHaveBeenCalled();
  });
});
