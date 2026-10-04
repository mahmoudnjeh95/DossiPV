import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dossierJobFindUniqueOrThrow: vi.fn(),
  dossierJobUpdate: vi.fn(),
  companyFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  fileFindMany: vi.fn(),
  fileCreate: vi.fn(),
  checkResultCreateMany: vi.fn(),
  generateDossierDocument: vi.fn(),
  fillDossierTemplate: vi.fn(),
  convertDocxToPdf: vi.fn(),
  mergeAnnexes: vi.fn(),
  saveFile: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: {
      ...actual.db,
      dossierJob: { findUniqueOrThrow: mocks.dossierJobFindUniqueOrThrow, update: mocks.dossierJobUpdate },
      company: { findUnique: mocks.companyFindUnique },
      project: { findUnique: mocks.projectFindUnique },
      file: { findMany: mocks.fileFindMany, create: mocks.fileCreate },
      dossierCheckResult: { createMany: mocks.checkResultCreateMany },
    },
  };
});
vi.mock('../src/generate-dossier-document', () => ({ generateDossierDocument: mocks.generateDossierDocument, DossierGenerationBlockedError: class extends Error {} }));
vi.mock('@dossipv/docx-template', () => ({ fillDossierTemplate: mocks.fillDossierTemplate }));
vi.mock('../src/convert-to-pdf', () => ({ convertDocxToPdf: mocks.convertDocxToPdf }));
vi.mock('../src/merge-annexes', () => ({ mergeAnnexes: mocks.mergeAnnexes }));
vi.mock('@dossipv/file-storage', () => ({ saveFile: mocks.saveFile, getFilePath: vi.fn(() => '/fake/path') }));
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, readFile: mocks.readFile };
});

import { processJob } from '../src/process-job';

const validSnapshot = {
  version: 1,
  projectId: 'project-1',
  companyId: 'company-1',
  engineInput: {
    array: [{ inverter: { pacW: 4000, vdcMaxV: 1000, mpptMinV: 80, mpptMaxV: 550 }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] }],
    dcFuse: null,
    acIsolator: null,
    module: { pmaxW: 620, vmpV: 41.2, impA: 15.05, vocV: 49.3, iscA: 15.85 },
  },
  projectMeta: { moduleBrandModel: 'X', inverterBrandModel: 'Y', gridType: 'TT', mountingType: 'ROOF', structureMaterial: 'ALUMINUM', earthRodCount: 1 },
  client: { fullName: 'Ahmed', address: 'Tunis', stegReference: 'STEG-1' },
  cableRuns: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: validSnapshot });
  mocks.companyFindUnique.mockResolvedValue({ name: 'SolarPro', address: 'Tunis', phone: '71000000', email: 'a@b.tn', logoFileId: null, anmeCertificateFileId: null });
  mocks.projectFindUnique.mockResolvedValue({ annexes: null });
  mocks.fileFindMany.mockResolvedValue([]);
  mocks.generateDossierDocument.mockResolvedValue({
    sections: { introduction: 'i', solution: 's', cabling: 'c', earthing: 'e', structure: 'st', conclusion: 'co' },
    engineResult: {
      derived: {
        P_DC_W: 3100,
        MODULE_COUNT: 5,
        NS_MIN: 10,
        NS_MAX: 14,
        NS_OPT_MAX: 13,
        NP_MAX: 2,
        NP_OPT: 2,
        DU_DC_V: 2.3,
        DU_DC_PCT: 0.74,
        DU_AC_V: 1.1,
        DU_AC_PCT: 0.48,
        F_WEIGHT_N: 1200,
        STABILITY_LHS: 1500,
        STABILITY_RHS: 1200,
      },
      checks: [{ id: 'C01', level: 'BLOCK', pass: true, message: 'ok' }],
      hasBlockingFailure: false,
    },
  });
  mocks.fillDossierTemplate.mockReturnValue(Buffer.from('fake docx'));
  mocks.convertDocxToPdf.mockResolvedValue(Buffer.from('%PDF-fake'));
  mocks.mergeAnnexes.mockResolvedValue(Buffer.from('%PDF-merged'));
  mocks.saveFile.mockResolvedValue({ storageKey: 'dossier/fake.bin' });
  mocks.fileCreate.mockResolvedValue({ id: 'file-x' });
  mocks.readFile.mockResolvedValue(Buffer.from('template bytes'));
});

describe('processJob — success path', () => {
  it('runs every step and marks the job SUCCEEDED with three linked files and persisted check results', async () => {
    await processJob('job-1');

    expect(mocks.generateDossierDocument).toHaveBeenCalled();
    expect(mocks.fillDossierTemplate).toHaveBeenCalled();
    expect(mocks.convertDocxToPdf).toHaveBeenCalled();
    expect(mocks.mergeAnnexes).toHaveBeenCalled();
    expect(mocks.fileCreate).toHaveBeenCalledTimes(3); // docx, pdf, annexesPdf

    const finalUpdateCall = mocks.dossierJobUpdate.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === 'SUCCEEDED',
    );
    expect(finalUpdateCall).toBeDefined();
    expect(mocks.checkResultCreateMany).toHaveBeenCalledWith({
      data: [{ jobId: 'job-1', checkId: 'C01', level: 'BLOCK', pass: true, message: 'ok' }],
    });
  });
});

describe('processJob — failure paths', () => {
  it('fails with failedStep "snapshot" when inputSnapshot cannot be parsed', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: { garbage: true } });

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { status: string; failedStep: string } };
    expect(failCall.data.status).toBe('FAILED');
    expect(failCall.data.failedStep).toBe('snapshot');
  });

  it('fails with failedStep "text" when generateDossierDocument throws', async () => {
    mocks.generateDossierDocument.mockRejectedValue(new Error('Claude unavailable'));

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { status: string; failedStep: string; failureReason: string } };
    expect(failCall.data.failedStep).toBe('text');
    // failureReason is a generic, installer-safe message — never the raw internal error text
    // (which could leak internals like file paths or DB details). The real error is logged
    // server-side only (see process-job.ts's own fail() helper).
    expect(failCall.data.failureReason).not.toContain('Claude unavailable');
    expect(failCall.data.failureReason).toBe('La génération du texte du dossier a échoué.');
  });

  it('fails with failedStep "docx" when the company cannot be found', async () => {
    mocks.companyFindUnique.mockResolvedValue(null);

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { failedStep: string } };
    expect(failCall.data.failedStep).toBe('docx');
  });

  it('fails with failedStep "pdf" when LibreOffice conversion throws', async () => {
    mocks.convertDocxToPdf.mockRejectedValue(new Error('soffice exited with code 1'));

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { failedStep: string } };
    expect(failCall.data.failedStep).toBe('pdf');
  });

  it('fails with failedStep "save" when writing the final files throws', async () => {
    mocks.saveFile.mockRejectedValue(new Error('disk full'));

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { failedStep: string } };
    expect(failCall.data.failedStep).toBe('save');
  });

  it('never stores internal error details (file paths, DB errors) in the installer-visible failureReason', async () => {
    mocks.convertDocxToPdf.mockRejectedValue(new Error('ENOENT: no such file or directory, open \'/var/data/secret-template.docx\''));

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { failureReason: string } };
    expect(failCall.data.failureReason).not.toContain('/var/data');
    expect(failCall.data.failureReason).not.toContain('ENOENT');
    expect(failCall.data.failureReason).toBe('La conversion en PDF a échoué.');
  });
});

describe('processJob — annexes edge cases (Review Focus items 1 and 4)', () => {
  it('succeeds with a complete dossier when the project has zero annex files uploaded', async () => {
    mocks.companyFindUnique.mockResolvedValue({ name: 'SolarPro', address: 'Tunis', phone: '71000000', email: 'a@b.tn', anmeCertificateFileId: null });
    mocks.projectFindUnique.mockResolvedValue({ annexes: null });

    await processJob('job-1');

    expect(mocks.mergeAnnexes).toHaveBeenCalledWith(expect.any(Buffer), []);
    const finalUpdateCall = mocks.dossierJobUpdate.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === 'SUCCEEDED',
    );
    expect(finalUpdateCall).toBeDefined();
  });
});
