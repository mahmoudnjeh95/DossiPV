import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testBill } from '../../../packages/bill-reader/test/fixtures/test-bill';

const m = vi.hoisted(() => {
  const mockGet = vi.fn();
  return {
    mockGet,
    mockCookies: vi.fn(() => Promise.resolve({ get: mockGet })),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    mockValidateSession: vi.fn(),
    mockSubscriptionFindUnique: vi.fn(),
    mockProjectFindFirst: vi.fn(),
    mockBillImportCount: vi.fn(),
    mockTransaction: vi.fn(),
    tx: {
      file: { create: vi.fn() },
      project: { create: vi.fn() },
      projectClient: { create: vi.fn() },
      projectSite: { create: vi.fn() },
      projectAnnexes: { create: vi.fn() },
      projectBillImport: { create: vi.fn() },
    },
    mockReadStegBill: vi.fn(),
    mockSaveFile: vi.fn(),
    mockDeleteFile: vi.fn(),
    mockSharpToBuffer: vi.fn(),
    mockSharp: vi.fn(),
    mockRotate: vi.fn(),
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
  return {
    ...actual,
    db: {
      ...actual.db,
      subscription: { findUnique: m.mockSubscriptionFindUnique },
      project: { findFirst: m.mockProjectFindFirst },
      projectBillImport: { count: m.mockBillImportCount },
      $transaction: m.mockTransaction,
    },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: m.mockSaveFile, deleteFile: m.mockDeleteFile };
});
vi.mock('@dossipv/bill-reader', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/bill-reader')>('@dossipv/bill-reader');
  return { ...actual, readStegBill: m.mockReadStegBill };
});
vi.mock('@anthropic-ai/sdk', () => ({ default: class FakeAnthropic {} }));
vi.mock('sharp', () => ({ default: m.mockSharp }));

import { BillReadingError } from '@dossipv/bill-reader';
import { importStegBillAction } from '../app/(app)/projects/import-bill-actions';

const user = { id: 'user-1', companyId: 'company-1', email: 'a@b.com', fullName: 'A', role: 'OWNER' as const };

const activeSubscription = {
  status: 'ACTIVE',
  periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  plan: { name: 'Premium', monthlyDossierLimit: 20, tier: 'PREMIUM' },
};

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from([1, 2])]);

function billForm(bytes: Buffer = JPEG_BYTES, type = 'image/jpeg', name = 'facture.jpg'): FormData {
  const data = new FormData();
  data.set('bill', new File([new Uint8Array(bytes)], name, { type }));
  return data;
}

function createdData(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  return (mock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
}

function readInput(): { bytes: Buffer; mediaType: string } {
  return m.mockReadStegBill.mock.calls[0]?.[0] as { bytes: Buffer; mediaType: string };
}

async function redirectTarget(promise: Promise<unknown>): Promise<string> {
  await expect(promise).rejects.toThrow(/NEXT_REDIRECT:/);
  return m.mockRedirect.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.mockGet.mockReturnValue({ value: 'valid-token' });
  m.mockValidateSession.mockResolvedValue(user);
  m.mockSubscriptionFindUnique.mockResolvedValue(activeSubscription);
  m.mockBillImportCount.mockResolvedValue(0);
  m.mockProjectFindFirst.mockResolvedValue(null);
  m.mockReadStegBill.mockResolvedValue({ ...testBill, governorate: 'Gafsa' });
  m.mockSaveFile.mockResolvedValue({ storageKey: 'equipment/abc-facture.jpg' });
  m.mockDeleteFile.mockResolvedValue(undefined);
  const chain = { rotate: m.mockRotate, jpeg: vi.fn(), toBuffer: m.mockSharpToBuffer };
  m.mockSharp.mockReturnValue(chain);
  m.mockRotate.mockReturnValue(chain);
  chain.jpeg.mockReturnValue(chain);
  m.mockSharpToBuffer.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 9]));
  m.tx.file.create.mockResolvedValue({ id: 'file-1' });
  m.tx.project.create.mockResolvedValue({ id: 'project-1' });
  m.mockTransaction.mockImplementation((fn: (tx: typeof m.tx) => Promise<unknown>) => fn(m.tx));
});

describe('importStegBillAction', () => {
  it('requires a session before reading anything', async () => {
    m.mockValidateSession.mockResolvedValue(null);

    await expect(importStegBillAction(undefined, billForm())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(m.mockReadStegBill).not.toHaveBeenCalled();
  });

  it('rejects a missing file', async () => {
    expect(await importStegBillAction(undefined, new FormData())).toEqual({ error: 'Aucun fichier reçu.' });
    expect(m.mockReadStegBill).not.toHaveBeenCalled();
  });

  it('does not save the file when the bill cannot be read', async () => {
    const failure = new BillReadingError();
    m.mockReadStegBill.mockRejectedValue(failure);

    expect(await importStegBillAction(undefined, billForm())).toEqual({ error: failure.message });
    expect(m.mockSaveFile).not.toHaveBeenCalled();
  });

  it('returns a generic message for an unexpected reading failure', async () => {
    m.mockReadStegBill.mockRejectedValue(new Error('network'));

    expect(await importStegBillAction(undefined, billForm())).toEqual({
      error: 'Lecture de la facture impossible, réessayez.',
    });
    expect(m.mockSaveFile).not.toHaveBeenCalled();
  });

  it('creates the project from the reading and opens the proposals', async () => {
    const target = await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(target).toBe('/projects/project-1/proposals');
    expect(m.tx.file.create).toHaveBeenCalledWith({
      data: { fileName: 'facture.jpg', mimeType: 'jpeg', storageKey: 'equipment/abc-facture.jpg' },
    });
    expect(m.tx.project.create).toHaveBeenCalledWith({
      data: { companyId: 'company-1', tier: 'PREMIUM', status: 'DRAFT', flowStep: 'PROPOSALS' },
    });
    expect(createdData(m.tx.projectClient.create)).toMatchObject({
      projectId: 'project-1',
      fullName: 'MR TEST CLIENT',
      civility: 'M.',
      clientKind: 'residential',
      governorate: 'Gafsa',
      stegReference: '00000 000 0',
      subscribedPowerKVA: 13,
      annualConsumptionKWh: 21096,
    });
    const site = createdData(m.tx.projectSite.create);
    expect(site).toMatchObject({
      projectId: 'project-1',
      phases: 1,
      gridType: 'BT',
      mountingType: 'FLAT_ROOF_BALLAST',
      tiltDeg: 30,
      azimuthDeg: 0,
    });
    expect(site['gpsLat']).toBeCloseTo(34.42, 1);
    expect(site['gpsLon']).toBeCloseTo(8.78, 1);
    expect(m.tx.projectAnnexes.create).toHaveBeenCalledWith({
      data: { projectId: 'project-1', lastPaidBillFileId: 'file-1' },
    });
    const imported = createdData(m.tx.projectBillImport.create);
    expect(imported).toMatchObject({
      projectId: 'project-1',
      fileId: 'file-1',
      annualConsumptionKWh: 21096,
      modelId: 'claude-opus-5-5',
    });
    expect(imported['warnings']).toEqual(expect.arrayContaining([expect.stringContaining('inhabituelle')]));
  });

  it('keeps unreadable fields null', async () => {
    m.mockReadStegBill.mockResolvedValue({ ...testBill, subscribedPowerKVA: null, clientName: null });

    await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(createdData(m.tx.projectClient.create)).toMatchObject({
      subscribedPowerKVA: null,
      fullName: 'Client à compléter',
    });
  });

  it('falls back to Tunis with a warning when the governorate is unknown', async () => {
    m.mockReadStegBill.mockResolvedValue({ ...testBill, governorate: null });

    await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(createdData(m.tx.projectSite.create)).toMatchObject({ gpsLat: 36.8065, gpsLon: 10.1815 });
    expect(createdData(m.tx.projectBillImport.create)['warnings']).toContain(
      'Gouvernorat non reconnu : position par défaut (Tunis).',
    );
  });

  it('warns when the company already has a project for the same STEG reference', async () => {
    m.mockProjectFindFirst.mockResolvedValue({ id: 'other' });

    await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(m.mockProjectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company-1', client: { stegReference: '00000 000 0' } } }),
    );
    expect(createdData(m.tx.projectBillImport.create)['warnings']).toContain(
      'Un autre projet existe déjà pour la référence STEG 00000 000 0.',
    );
  });

  it('stores a WebP upload as JPEG while Claude receives the original bytes', async () => {
    await redirectTarget(importStegBillAction(undefined, billForm(WEBP_BYTES, 'image/webp', 'facture.webp')));

    expect(readInput()).toMatchObject({ mediaType: 'image/webp' });
    expect(Buffer.compare(readInput().bytes, WEBP_BYTES)).toBe(0);
    expect(m.mockSaveFile).toHaveBeenCalledWith(expect.any(Buffer), 'facture.jpg', 'image/jpeg');
    expect(m.tx.file.create).toHaveBeenCalledWith({
      data: { fileName: 'facture.jpg', mimeType: 'jpeg', storageKey: 'equipment/abc-facture.jpg' },
    });
  });

  it('rejects an unconvertible WebP before calling Claude or saving anything', async () => {
    m.mockSharpToBuffer.mockRejectedValue(new Error('Input image exceeds pixel limit'));

    expect(await importStegBillAction(undefined, billForm(WEBP_BYTES, 'image/webp', 'facture.webp'))).toEqual({
      error: 'Image de facture trop grande ou illisible.',
    });
    expect(m.mockReadStegBill).not.toHaveBeenCalled();
    expect(m.mockSaveFile).not.toHaveBeenCalled();
  });

  it('limits the pixel count and applies EXIF rotation when converting WebP', async () => {
    await redirectTarget(importStegBillAction(undefined, billForm(WEBP_BYTES, 'image/webp', 'facture.webp')));

    expect(m.mockSharp).toHaveBeenCalledWith(expect.any(Buffer), { limitInputPixels: 40_000_000 });
    expect(m.mockRotate).toHaveBeenCalled();
  });

  it('deletes the saved file if the database write fails', async () => {
    m.mockTransaction.mockRejectedValue(new Error('db down'));

    expect(await importStegBillAction(undefined, billForm())).toEqual({ error: 'Enregistrement impossible, réessayez.' });
    expect(m.mockDeleteFile).toHaveBeenCalledWith('equipment/abc-facture.jpg');
  });
});

describe('importStegBillAction — subscription and daily limit (before the paid Claude call)', () => {
  it('refuses when the company has no subscription', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue(null);

    expect(await importStegBillAction(undefined, billForm())).toEqual({
      error: "Votre abonnement n'est pas actif : import de facture impossible.",
    });
    expect(m.mockReadStegBill).not.toHaveBeenCalled();
  });

  it('refuses when the subscription is expired', async () => {
    m.mockSubscriptionFindUnique.mockResolvedValue({ ...activeSubscription, periodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000) });

    expect(await importStegBillAction(undefined, billForm())).toEqual({
      error: "Votre abonnement n'est pas actif : import de facture impossible.",
    });
    expect(m.mockReadStegBill).not.toHaveBeenCalled();
  });

  it('refuses the 31st bill import of the day and counts the company imports since local midnight', async () => {
    m.mockBillImportCount.mockResolvedValue(30);

    expect(await importStegBillAction(undefined, billForm())).toEqual({ error: 'Limite de 30 factures importées par jour atteinte.' });
    expect(m.mockReadStegBill).not.toHaveBeenCalled();
    const now = new Date();
    expect(m.mockBillImportCount).toHaveBeenCalledWith({
      where: { project: { companyId: 'company-1' }, createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
    });
  });

  it('accepts the 30th bill import of the day', async () => {
    m.mockBillImportCount.mockResolvedValue(29);

    await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(m.mockReadStegBill).toHaveBeenCalled();
  });
});

describe('importStegBillAction — three-phase / medium-voltage bills', () => {
  const THREE_PHASE_WARNING = 'Facture triphasée ou moyenne tension détectée : les propositions automatiques ne couvrent que le BT monophasé.';

  it.each(['BT Triphasé', 'MT', 'Moyenne Tension'])('creates a three-phase site with a warning for the tariff "%s"', async (tariffLabel) => {
    m.mockReadStegBill.mockResolvedValue({ ...testBill, tariffLabel });

    await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(createdData(m.tx.projectSite.create)).toMatchObject({ phases: 3 });
    expect(createdData(m.tx.projectBillImport.create)['warnings']).toContain(THREE_PHASE_WARNING);
  });

  it.each(['BT Monophasé', 'Électricité BT résidentiel'])('keeps a single-phase site without that warning for the tariff "%s"', async (tariffLabel) => {
    m.mockReadStegBill.mockResolvedValue({ ...testBill, tariffLabel });

    await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(createdData(m.tx.projectSite.create)).toMatchObject({ phases: 1 });
    expect(createdData(m.tx.projectBillImport.create)['warnings']).not.toContain(THREE_PHASE_WARNING);
  });
});

describe('importStegBillAction — values outside the corrections-form bounds', () => {
  it('drops an out-of-range subscribed power with a warning', async () => {
    m.mockReadStegBill.mockResolvedValue({ ...testBill, subscribedPowerKVA: 250 });

    await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(createdData(m.tx.projectClient.create)).toMatchObject({ subscribedPowerKVA: null });
    expect(createdData(m.tx.projectBillImport.create)['warnings']).toContain('Valeur lue hors limites ignorée : Puissance souscrite.');
  });

  it('drops an out-of-range annual consumption with a warning', async () => {
    m.mockReadStegBill.mockResolvedValue({ ...testBill, totalElectricityKWh: 900_000, monthsBilled: 4 });

    await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(createdData(m.tx.projectClient.create)).toMatchObject({ annualConsumptionKWh: null });
    expect(createdData(m.tx.projectBillImport.create)).toMatchObject({ annualConsumptionKWh: null });
    expect(createdData(m.tx.projectBillImport.create)['warnings']).toContain('Valeur lue hors limites ignorée : Consommation annuelle.');
  });

  it('drops an over-long client name and STEG reference with warnings', async () => {
    m.mockReadStegBill.mockResolvedValue({ ...testBill, clientName: 'A'.repeat(201), stegReference: '9'.repeat(101) });

    await redirectTarget(importStegBillAction(undefined, billForm()));

    expect(createdData(m.tx.projectClient.create)).toMatchObject({ fullName: 'Client à compléter', stegReference: null });
    expect(m.mockProjectFindFirst).not.toHaveBeenCalled();
    const warnings = createdData(m.tx.projectBillImport.create)['warnings'];
    expect(warnings).toContain('Valeur lue hors limites ignorée : Nom du client.');
    expect(warnings).toContain('Valeur lue hors limites ignorée : Référence STEG.');
  });

  it('keeps in-range values untouched', async () => {
    await redirectTarget(importStegBillAction(undefined, billForm()));

    const warnings = createdData(m.tx.projectBillImport.create)['warnings'] as string[];
    expect(warnings.some((w) => w.startsWith('Valeur lue hors limites'))).toBe(false);
  });
});
