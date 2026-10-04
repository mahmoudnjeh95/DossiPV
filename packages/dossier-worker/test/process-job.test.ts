import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

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
  mergeDocumentFragments: vi.fn(),
  renderCoverPage: vi.fn(),
  renderDrawingPages: vi.fn(),
  generatePage37Layout: vi.fn(),
  fetchSatelliteImage: vi.fn(),
  renderSitePlanPages: vi.fn(),
  renderTableOfContents: vi.fn(),
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
vi.mock('../src/merge-annexes', () => ({ mergeAnnexes: mocks.mergeAnnexes, mergeDocumentFragments: mocks.mergeDocumentFragments }));
vi.mock('../src/render-cover-page', () => ({ renderCoverPage: mocks.renderCoverPage }));
vi.mock('../src/render-drawings', () => ({ renderDrawingPages: mocks.renderDrawingPages }));
vi.mock('../src/generate-page-37-layout', () => ({ generatePage37Layout: mocks.generatePage37Layout }));
vi.mock('../src/fetch-satellite-image', () => ({ fetchSatelliteImage: mocks.fetchSatelliteImage }));
vi.mock('../src/render-site-plan-pages', () => ({ renderSitePlanPages: mocks.renderSitePlanPages }));
vi.mock('../src/render-toc', () => ({ renderTableOfContents: mocks.renderTableOfContents }));
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
    dcRun: { sectionMm2: 6, lengthM: 20 },
    acRun: { sectionMm2: 10, lengthM: 15 },
  },
  projectMeta: { moduleBrandModel: 'X', inverterBrandModel: 'Y', gridType: 'TT', mountingType: 'ROOF', structureMaterial: 'ALUMINUM', earthRodCount: 1 },
  client: { fullName: 'Ahmed', address: 'Tunis', stegReference: 'STEG-1' },
  cableRuns: [],
};

const premiumSnapshot = {
  ...validSnapshot,
  tier: 'PREMIUM',
  site: { gpsLat: 36.8, gpsLon: 10.2, technicalRoomPointLat: 36.801, technicalRoomPointLon: 10.201, meterPointLat: 36.799, meterPointLon: 10.199, earthPitPointLat: null, earthPitPointLon: null },
};

// processJob reads the real page count of the body PDF and the drawings PDF (pdf-lib's
// PDFDocument.load) to compute the TOC's fragment-level page numbers, so those two mocks must
// return genuine PDFs. The other fragments are only handed on to the (mocked) merge, so
// recognisable fake buffers are enough there.
async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([200, 200]);
  }
  return Buffer.from(await doc.save());
}

const COVER_PDF = Buffer.from('%PDF-fake-cover');
const TOC_PDF = Buffer.from('%PDF-fake-toc');
const SITE_PLAN_PDF = Buffer.from('%PDF-fake-site-plan');
const ASSEMBLED_PDF = Buffer.from('%PDF-fake-assembled');
const SATELLITE_TILE = Buffer.from('fake satellite tile');
const PAGE_37_LAYOUT = { panelRectangle: [{ lat: 36.8, lon: 10.2 }], wireRoute: [{ lat: 36.8, lon: 10.2 }] };
let bodyPdf: Buffer;
let drawingsPdf: Buffer;

function findSucceededUpdate(): unknown {
  return mocks.dossierJobUpdate.mock.calls.find((call) => (call[0] as { data: { status?: string } }).data.status === 'SUCCEEDED');
}

beforeEach(async () => {
  vi.clearAllMocks();
  bodyPdf = await makePdf(3);
  drawingsPdf = await makePdf(2);
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
  mocks.convertDocxToPdf.mockResolvedValue(bodyPdf);
  mocks.mergeAnnexes.mockResolvedValue(Buffer.from('%PDF-merged'));
  mocks.mergeDocumentFragments.mockResolvedValue(ASSEMBLED_PDF);
  mocks.renderCoverPage.mockResolvedValue(COVER_PDF);
  mocks.renderDrawingPages.mockResolvedValue(drawingsPdf);
  mocks.fetchSatelliteImage.mockResolvedValue(SATELLITE_TILE);
  mocks.generatePage37Layout.mockResolvedValue(PAGE_37_LAYOUT);
  mocks.renderSitePlanPages.mockResolvedValue(SITE_PLAN_PDF);
  mocks.renderTableOfContents.mockResolvedValue(TOC_PDF);
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
    expect(mocks.mergeDocumentFragments).toHaveBeenCalled();
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

    // dossier.pdf is cover+TOC+body+drawings+sitePlan with annexes merged in (master spec §5
    // step 8); annexes.pdf is annexes-only. With zero annex files, both calls pass [].
    const mergeCalls = mocks.mergeDocumentFragments.mock.calls as [unknown[], unknown[]][];
    expect(mergeCalls.some(([, annexes]) => Array.isArray(annexes) && annexes.length === 0)).toBe(true);
    const finalUpdateCall = mocks.dossierJobUpdate.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === 'SUCCEEDED',
    );
    expect(finalUpdateCall).toBeDefined();
  });
});

describe('processJob — equipment datasheet collection', () => {
  it('includes equipment datasheet/homologation files from the snapshot, de-duplicated by file id', async () => {
    const snapshotWithEquipment = {
      ...validSnapshot,
      arrayConfig: {
        module: { brand: 'LONGi', model: 'X', datasheetFileId: 'file-module-datasheet' },
        inverters: [
          { inverter: { brand: 'Sofar', model: 'Y', datasheetFileId: 'file-inverter-datasheet' }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] },
          { inverter: { brand: 'Sofar', model: 'Y', datasheetFileId: 'file-inverter-datasheet' }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] },
        ],
      },
    };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: snapshotWithEquipment });
    mocks.fileFindMany.mockResolvedValue([
      { id: 'file-module-datasheet', mimeType: 'pdf', storageKey: 'module-datasheet.pdf' },
      { id: 'file-inverter-datasheet', mimeType: 'pdf', storageKey: 'inverter-datasheet.pdf' },
    ]);

    await processJob('job-1');

    // Exactly 2 distinct datasheets fetched (not 3, even though the inverter is referenced twice).
    const findManyCall = mocks.fileFindMany.mock.calls[0]![0] as { where: { id: { in: string[] } } };
    const uniqueIds = new Set(findManyCall.where.id.in);
    expect(uniqueIds.has('file-module-datasheet')).toBe(true);
    expect(uniqueIds.has('file-inverter-datasheet')).toBe(true);
    expect(findManyCall.where.id.in.filter((id) => id === 'file-inverter-datasheet')).toHaveLength(1);
  });
});

describe('processJob — full fragment assembly (Premium tier)', () => {
  it('calls every new renderer and merges fragments in the documented order for a PREMIUM project', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });

    await processJob('job-1');

    expect(mocks.renderCoverPage).toHaveBeenCalled();
    expect(mocks.renderDrawingPages).toHaveBeenCalled();
    expect(mocks.fetchSatelliteImage).toHaveBeenCalled();
    expect(mocks.generatePage37Layout).toHaveBeenCalled();
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith(expect.objectContaining({ tier: 'PREMIUM' }));
    expect(mocks.renderTableOfContents).toHaveBeenCalled();
    expect(mocks.mergeDocumentFragments).toHaveBeenCalled();
  });

  it('skips fetchSatelliteImage and generatePage37Layout entirely for a STANDARD project (no network/API call)', async () => {
    await processJob('job-1'); // validSnapshot's default tier is STANDARD

    expect(mocks.fetchSatelliteImage).not.toHaveBeenCalled();
    expect(mocks.generatePage37Layout).not.toHaveBeenCalled();
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith(expect.objectContaining({ tier: 'STANDARD' }));
  });
});

describe('processJob — fragment assembly details', () => {
  it('merges cover → TOC → body → drawings → map pages (with annexes) into dossier.pdf, and a separate annexes-only PDF', async () => {
    await processJob('job-1');

    // Master spec §5 step 8: dossier.pdf carries the annexes merged in; annexes.pdf is
    // annexes-only (no cover/body/drawings/map-page fragments).
    expect(mocks.mergeDocumentFragments).toHaveBeenCalledWith([COVER_PDF, TOC_PDF, bodyPdf, drawingsPdf, SITE_PLAN_PDF], []);
    expect(mocks.mergeDocumentFragments).toHaveBeenCalledWith([], []);
    expect(mocks.saveFile).toHaveBeenCalledWith(ASSEMBLED_PDF, 'dossier.pdf', 'application/pdf');
    expect(mocks.saveFile).toHaveBeenCalledWith(ASSEMBLED_PDF, 'annexes.pdf', 'application/pdf');
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('gives the TOC exact fragment-level page numbers from the real body and drawings page counts', async () => {
    mocks.convertDocxToPdf.mockResolvedValue(await makePdf(5));

    await processJob('job-1');

    // Cover = page 1, TOC = page 2, body = pages 3-7, drawings = pages 8-9, map pages from 10.
    const entries = mocks.renderTableOfContents.mock.calls[0]![0] as { title: string; pageNumber: number }[];
    expect(entries.find((e) => e.title === 'Annexe — Schémas électriques')?.pageNumber).toBe(8);
    expect(entries.find((e) => e.title === 'Annexe — Plans de situation')?.pageNumber).toBe(10);
  });

  it('builds the cover page and the drawings from the company and the frozen snapshot', async () => {
    await processJob('job-1');

    expect(mocks.renderCoverPage).toHaveBeenCalledWith(expect.objectContaining({ companyName: 'SolarPro', clientFullName: 'Ahmed', companyLogoBuffer: null }));
    expect(mocks.renderDrawingPages).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleLabel: 'X',
        inverters: [{ inverterLabel: 'Y (1)', pacW: 4000, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] }],
        dcSwitchLabel: '—',
        dcRun: { sectionMm2: 6, lengthM: 20 },
        acRun: { sectionMm2: 10, lengthM: 15 },
        earthRodCount: 1,
      }),
    );
  });

  it('passes the placed site points (null when not placed) to the page-37 layout call and the premium renderer', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    const expectedPoints = { technicalRoom: { lat: 36.801, lon: 10.201 }, meter: { lat: 36.799, lon: 10.199 }, earthPit: null };

    await processJob('job-1');

    expect(mocks.fetchSatelliteImage).toHaveBeenCalledWith({ lat: 36.8, lon: 10.2 });
    expect(mocks.generatePage37Layout).toHaveBeenCalledWith({ satelliteImage: SATELLITE_TILE, points: expectedPoints }, expect.anything());
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith({
      tier: 'PREMIUM',
      clientFullName: 'Ahmed',
      clientAddress: 'Tunis',
      gps: { lat: 36.8, lon: 10.2 },
      installerName: 'SolarPro',
      premiumData: { page37SatelliteImage: SATELLITE_TILE, page38SatelliteImage: SATELLITE_TILE, layout: PAGE_37_LAYOUT, points: expectedPoints },
    });
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('falls back to the empty-frame site plan, with no network/API call, for a PREMIUM project whose site is not located yet', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: { ...premiumSnapshot, site: null } });

    await processJob('job-1');

    expect(mocks.fetchSatelliteImage).not.toHaveBeenCalled();
    expect(mocks.generatePage37Layout).not.toHaveBeenCalled();
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith(expect.objectContaining({ tier: 'STANDARD', premiumData: null, gps: { lat: 0, lon: 0 } }));
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('retries a transient Esri tile fetch failure instead of failing the job', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    mocks.fetchSatelliteImage.mockRejectedValueOnce(new TypeError('fetch failed'));

    await processJob('job-1');

    // 1 failed attempt + 1 retried success (page 37) + 1 fetch for page 38.
    expect(mocks.fetchSatelliteImage).toHaveBeenCalledTimes(3);
    expect(findSucceededUpdate()).toBeDefined();
  });
});

describe('processJob — failure paths of the fragment-assembly steps', () => {
  // An unreadable body/drawings PDF fails at the step that produced it (its page count is read
  // there), not later at the TOC or the merge.
  const failureCases: { failedStep: string; tier: 'STANDARD' | 'PREMIUM'; arrange: () => void }[] = [
    { failedStep: 'pdf', tier: 'STANDARD', arrange: () => mocks.convertDocxToPdf.mockResolvedValue(Buffer.from('not a pdf')) },
    { failedStep: 'cover', tier: 'STANDARD', arrange: () => mocks.renderCoverPage.mockRejectedValue(new Error('cover boom')) },
    { failedStep: 'drawings', tier: 'STANDARD', arrange: () => mocks.renderDrawingPages.mockRejectedValue(new Error('drawings boom')) },
    { failedStep: 'drawings', tier: 'STANDARD', arrange: () => mocks.renderDrawingPages.mockResolvedValue(Buffer.from('not a pdf')) },
    { failedStep: 'map-pages', tier: 'PREMIUM', arrange: () => mocks.fetchSatelliteImage.mockRejectedValue(new Error('satellite tile boom')) },
    { failedStep: 'map-pages', tier: 'STANDARD', arrange: () => mocks.renderSitePlanPages.mockRejectedValue(new Error('site plan boom')) },
    { failedStep: 'page-37-layout', tier: 'PREMIUM', arrange: () => mocks.generatePage37Layout.mockRejectedValue(new Error('page-37 layout boom')) },
    { failedStep: 'toc', tier: 'STANDARD', arrange: () => mocks.renderTableOfContents.mockRejectedValue(new Error('toc boom')) },
    { failedStep: 'assembly', tier: 'STANDARD', arrange: () => mocks.mergeDocumentFragments.mockRejectedValue(new Error('assembly boom')) },
  ];

  it.each(failureCases)('fails with failedStep $failedStep ($tier) and a step-specific generic message', async ({ failedStep, tier, arrange }) => {
    if (tier === 'PREMIUM') {
      mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    }
    arrange();

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { status: string; failedStep: string; failureReason: string } };
    expect(failCall.data.status).toBe('FAILED');
    expect(failCall.data.failedStep).toBe(failedStep);
    expect(failCall.data.failureReason).not.toContain('boom');
    expect(failCall.data.failureReason).not.toBe('La génération du dossier a échoué.'); // not the unknown-step fallback
    expect(mocks.saveFile).not.toHaveBeenCalled();
  });
});
