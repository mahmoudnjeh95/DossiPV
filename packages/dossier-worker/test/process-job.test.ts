import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { computeSectionNumbers } from '../src/build-template-data';

const mocks = vi.hoisted(() => ({
  dossierJobFindUniqueOrThrow: vi.fn(),
  dossierJobUpdate: vi.fn(),
  companyFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  fileFindMany: vi.fn(),
  fileFindUnique: vi.fn(),
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
  getFilePath: vi.fn(),
  simulateProduction: vi.fn(),
  runEngine: vi.fn(),
  projectSimulationUpsert: vi.fn(),
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
      file: { findMany: mocks.fileFindMany, findUnique: mocks.fileFindUnique, create: mocks.fileCreate },
      dossierCheckResult: { createMany: mocks.checkResultCreateMany },
      projectSimulation: { upsert: mocks.projectSimulationUpsert },
    },
  };
});
vi.mock('@dossipv/engine', async () => ({
  ...(await vi.importActual<typeof import('@dossipv/engine')>('@dossipv/engine')),
  runEngine: mocks.runEngine,
}));
vi.mock('../src/run-simulation', async () => ({
  ...(await vi.importActual<typeof import('../src/run-simulation')>('../src/run-simulation')),
  simulateProduction: mocks.simulateProduction,
}));
vi.mock('../src/generate-dossier-document', () => ({ generateDossierDocument: mocks.generateDossierDocument, DossierGenerationBlockedError: class extends Error {} }));
vi.mock('@dossipv/docx-template', () => ({ fillDossierTemplate: mocks.fillDossierTemplate }));
vi.mock('../src/convert-to-pdf', () => ({ convertDocxToPdf: mocks.convertDocxToPdf }));
vi.mock('../src/merge-annexes', () => ({ mergeAnnexes: mocks.mergeAnnexes, mergeDocumentFragments: mocks.mergeDocumentFragments }));
vi.mock('../src/render-cover-page', () => ({ renderCoverPage: mocks.renderCoverPage }));
vi.mock('../src/render-drawings', () => ({ renderDrawingPages: mocks.renderDrawingPages }));
// Only the network/API calls are mocked; the pure view-planning/projection helpers and the error
// classes stay real, so the test exercises the real geometry process-job hands to the renderer.
vi.mock('../src/generate-page-37-layout', async () => ({
  ...(await vi.importActual<typeof import('../src/generate-page-37-layout')>('../src/generate-page-37-layout')),
  generatePage37Layout: mocks.generatePage37Layout,
}));
vi.mock('../src/fetch-satellite-image', async () => ({
  ...(await vi.importActual<typeof import('../src/fetch-satellite-image')>('../src/fetch-satellite-image')),
  fetchSatelliteImage: mocks.fetchSatelliteImage,
}));
vi.mock('../src/render-site-plan-pages', () => ({ renderSitePlanPages: mocks.renderSitePlanPages }));
vi.mock('../src/render-toc', () => ({ renderTableOfContents: mocks.renderTableOfContents }));
vi.mock('@dossipv/file-storage', () => ({ saveFile: mocks.saveFile, getFilePath: mocks.getFilePath }));
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, readFile: mocks.readFile };
});

import { PvgisFetchError } from '@dossipv/pvgis-client';
import { processJob } from '../src/process-job';
import type { ProductionSimulation } from '../src/run-simulation';
import { planImplantationView, planSituationView, projectToImage, isInsideImage } from '../src/fetch-satellite-image';
import { Page37LayoutOutOfBoundsError } from '../src/generate-page-37-layout';

const validSnapshot = {
  version: 1,
  projectId: 'project-1',
  companyId: 'company-1',
  engineInput: {
    dossierDate: '2026-10-03',
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
  site: { gpsLat: 36.8, gpsLon: 10.2, tiltDeg: 30, azimuthDeg: null },
};

const premiumSnapshot = {
  ...validSnapshot,
  tier: 'PREMIUM',
  site: { gpsLat: 36.8, gpsLon: 10.2, tiltDeg: 30, technicalRoomPointLat: 36.801, technicalRoomPointLon: 10.201, meterPointLat: 36.799, meterPointLon: 10.199, earthPitPointLat: null, earthPitPointLon: null },
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
const ASSEMBLED_PDF = Buffer.from('%PDF-fake-assembled');
const SATELLITE_TILE = Buffer.from('fake satellite tile');
const PAGE_37_LAYOUT = {
  panelRectangle: [{ x: 250, y: 250 }, { x: 300, y: 250 }, { x: 300, y: 290 }, { x: 250, y: 290 }],
  wireRoute: [{ x: 300, y: 270 }, { x: 400, y: 200 }],
};
const PRODUCTION: ProductionSimulation = {
  lat: 36.8,
  lon: 10.2,
  tiltDeg: 30,
  azimuthDeg: 0,
  weatherYear: 2020,
  installedKWp: 3.1,
  annualProductionKWh: 5400,
  annualArrayKWh: 5900,
  specificYieldKWhPerKWp: 5400 / 3.1,
  performanceRatioPct: 81.5,
  monthly: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    globHorKWhM2: 150,
    globIncKWhM2: 170,
    ambientTempC: 20,
    eArrayKWh: 490,
    eGridKWh: 450,
    prPct: 81.5,
  })),
};
const PVGIS_DOWN_REASON = "PVGIS indisponible : le dossier n'a pas été généré. Réessayez plus tard.";
let bodyPdf: Buffer;
let drawingsPdf: Buffer;
// A real 2-page PDF (pages 37-38 always render exactly 2 pages, both tiers) — processJob now
// reads this fragment's own page count (for the TOC's Annexes entry), so it must be a real,
// loadable PDF like bodyPdf/drawingsPdf, not a recognisable fake buffer.
let sitePlanPdf: Buffer;

function findSucceededUpdate(): unknown {
  return mocks.dossierJobUpdate.mock.calls.find((call) => (call[0] as { data: { status?: string } }).data.status === 'SUCCEEDED');
}

beforeEach(async () => {
  vi.clearAllMocks();
  bodyPdf = await makePdf(3);
  drawingsPdf = await makePdf(2);
  sitePlanPdf = await makePdf(2);
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
  mocks.renderSitePlanPages.mockResolvedValue(sitePlanPdf);
  mocks.renderTableOfContents.mockResolvedValue(TOC_PDF);
  mocks.saveFile.mockResolvedValue({ storageKey: 'dossier/fake.bin' });
  mocks.fileCreate.mockResolvedValue({ id: 'file-x' });
  mocks.readFile.mockResolvedValue(Buffer.from('template bytes'));
  mocks.getFilePath.mockReturnValue('/fake/path');
  mocks.runEngine.mockReturnValue({ derived: { DU_DC_PCT: 0.74, DU_AC_PCT: 0.48 }, checks: [], hasBlockingFailure: false });
  mocks.simulateProduction.mockResolvedValue(PRODUCTION);
  mocks.projectSimulationUpsert.mockResolvedValue({});
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

  it('includes cable, connector, cable-tray, and earth distribution-block datasheets (I3), and contributes a shared cable datasheet exactly once even when two cable runs reference the same catalog row (spec §6)', async () => {
    const snapshotWithCablesAndAccessories = {
      ...validSnapshot,
      cableRuns: [
        { label: 'DC-1', sectionMm2: 6, lengthM: 20, installMethod: '13', cable: { brand: 'Generic', model: 'H1Z2Z2-K', datasheetFileId: 'file-cable-datasheet' } },
        { label: 'DC-2', sectionMm2: 6, lengthM: 15, installMethod: '13', cable: { brand: 'Generic', model: 'H1Z2Z2-K', datasheetFileId: 'file-cable-datasheet' } },
      ],
      cablingConfig: {
        connector: { brand: 'Stäubli', model: 'MC4', datasheetFileId: 'file-connector-datasheet' },
        cableTray: { brand: 'Generic', model: 'Tray-1', datasheetFileId: 'file-tray-datasheet' },
      },
      earthing: { rodCount: 3, distributionBlock: { brand: 'Generic', model: 'DB-1', datasheetFileId: 'file-db-datasheet' } },
    };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: snapshotWithCablesAndAccessories });
    mocks.fileFindMany.mockResolvedValue([
      { id: 'file-cable-datasheet', mimeType: 'pdf', storageKey: 'cable.pdf' },
      { id: 'file-connector-datasheet', mimeType: 'pdf', storageKey: 'connector.pdf' },
      { id: 'file-tray-datasheet', mimeType: 'pdf', storageKey: 'tray.pdf' },
      { id: 'file-db-datasheet', mimeType: 'pdf', storageKey: 'db.pdf' },
    ]);

    await processJob('job-1');

    const findManyCall = mocks.fileFindMany.mock.calls[0]![0] as { where: { id: { in: string[] } } };
    expect(findManyCall.where.id.in).toContain('file-connector-datasheet');
    expect(findManyCall.where.id.in).toContain('file-tray-datasheet');
    expect(findManyCall.where.id.in).toContain('file-db-datasheet');
    expect(findManyCall.where.id.in.filter((id) => id === 'file-cable-datasheet')).toHaveLength(1);
  });
});

describe('processJob — missing annex bytes on disk', () => {
  function enoent(): Error {
    return Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
  }

  beforeEach(() => {
    mocks.getFilePath.mockImplementation((storageKey: string) => `/storage/${storageKey}`);
    mocks.projectFindUnique.mockResolvedValue({ annexes: { lastPaidBillFileId: 'file-bill', extraFiles: [] } });
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project-1',
      inputSnapshot: {
        ...validSnapshot,
        arrayConfig: {
          module: { brand: 'LONGi', model: 'X', datasheetFileId: 'file-module-datasheet' },
          inverters: [{ inverter: { brand: 'Sofar', model: 'Y', datasheetFileId: null }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] }],
        },
      },
    });
    mocks.fileFindMany.mockResolvedValue([
      { id: 'file-bill', mimeType: 'application/pdf', storageKey: 'bill.pdf' },
      { id: 'file-module-datasheet', mimeType: 'application/pdf', storageKey: 'module-datasheet.pdf' },
    ]);
  });

  it('skips an equipment datasheet whose bytes are missing on disk, with a warning, and still succeeds', async () => {
    const billBytes = Buffer.from('bill bytes');
    mocks.readFile.mockImplementation((path: string) => {
      if (path === '/storage/module-datasheet.pdf') return Promise.reject(enoent());
      if (path === '/storage/bill.pdf') return Promise.resolve(billBytes);
      return Promise.resolve(Buffer.from('template bytes'));
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processJob('job-1');

    expect(findSucceededUpdate()).toBeDefined();
    const mergeCalls = mocks.mergeDocumentFragments.mock.calls as [unknown[], { buffer: Buffer }[]][];
    expect(mergeCalls[0]![1].map((a) => a.buffer)).toEqual([billBytes]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('file-module-datasheet'));
    warn.mockRestore();
  });

  it('still fails the job at "annexes" when a project annex (the bill) is missing on disk', async () => {
    mocks.readFile.mockImplementation((path: string) => (path === '/storage/bill.pdf' ? Promise.reject(enoent()) : Promise.resolve(Buffer.from('template bytes'))));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls.find((call) => (call[0] as { data: { status?: string } }).data.status === 'FAILED');
    expect((failCall![0] as { data: { failedStep: string } }).data.failedStep).toBe('annexes');
    error.mockRestore();
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
    expect(mocks.mergeDocumentFragments).toHaveBeenCalledWith([COVER_PDF, TOC_PDF, bodyPdf, drawingsPdf, sitePlanPdf], []);
    expect(mocks.mergeDocumentFragments).toHaveBeenCalledWith([], []);
    expect(mocks.saveFile).toHaveBeenCalledWith(ASSEMBLED_PDF, 'dossier.pdf', 'application/pdf');
    expect(mocks.saveFile).toHaveBeenCalledWith(ASSEMBLED_PDF, 'annexes.pdf', 'application/pdf');
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('gives the TOC exact fragment-level page numbers from the real body, drawings, and site-plan page counts (C3)', async () => {
    mocks.convertDocxToPdf.mockResolvedValue(await makePdf(5));

    await processJob('job-1');

    // Cover = page 1, TOC = page 2, body = pages 3-7, drawings = pages 8-9, map pages = pages 10-11.
    const entries = mocks.renderTableOfContents.mock.calls[0]![0] as { title: string; pageNumber: number }[];
    expect(entries.find((e) => e.title === 'Schémas électriques')?.pageNumber).toBe(8);
    expect(entries.find((e) => e.title === 'Plans de situation')?.pageNumber).toBe(10);
    expect(entries.find((e) => e.title === 'Annexes')?.pageNumber).toBe(12);
  });

  it('lists every in-body section (I-VI, IX, and the conditional VII/VIII), each within the body page range and in increasing order — never pointing at the TOC itself or out of order (C3)', async () => {
    // engineInput's default fixture has dcFuse: null, acIsolator: null, so VII/VIII are both absent
    // — the most common configuration the final review flagged as skipping straight from VI to IX.
    mocks.convertDocxToPdf.mockResolvedValue(await makePdf(2));

    await processJob('job-1');

    const entries = mocks.renderTableOfContents.mock.calls[0]![0] as { title: string; pageNumber: number }[];
    // Conclusion is "VII." here (not a hardcoded "IX.") — with no DC fuse and no AC isolator,
    // VI is directly followed by VII, exactly matching computeSectionNumbers()'s own output
    // (see build-template-data.test.ts's identical no-gap assertion for the body side).
    const bodyTitles = ['I. Préambule', 'II. Présentation du projet', 'III. Description de la solution technique', 'IV. Câblage', 'V. Mise à la terre', 'VI. Structure et lestage', 'VII. Conclusion'];
    const bodyEntries = bodyTitles.map((title) => entries.find((e) => e.title === title)!);

    for (const entry of bodyEntries) {
      expect(entry).toBeDefined();
      // Body = pages 3-4 (bodyPageCount 2, BODY_START_PAGE 3) — every in-body entry must land there.
      expect(entry.pageNumber).toBeGreaterThanOrEqual(3);
      expect(entry.pageNumber).toBeLessThanOrEqual(4);
    }
    for (let i = 1; i < bodyEntries.length; i += 1) {
      expect(bodyEntries[i]!.pageNumber).toBeGreaterThanOrEqual(bodyEntries[i - 1]!.pageNumber);
    }
    expect(entries.find((e) => e.title === 'VII. Protection DC — fusible')).toBeUndefined();
    expect(entries.find((e) => e.title === 'VIII. Protection AC — sectionneur')).toBeUndefined();
  });

  it('includes VII and VIII, correctly ordered with the rest, when the engine input requires a DC fuse and an AC isolator (C3)', async () => {
    const snapshotWithFuseAndIsolator = {
      ...validSnapshot,
      engineInput: { ...validSnapshot.engineInput, dcFuse: { ratedCurrentA: 16, ratedVoltageV: 1000 }, acIsolator: { ratedCurrentA: 25 } },
    };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: snapshotWithFuseAndIsolator });

    await processJob('job-1');

    const entries = mocks.renderTableOfContents.mock.calls[0]![0] as { title: string; pageNumber: number }[];
    const titles = entries.map((e) => e.title);
    expect(titles).toContain('VII. Protection DC — fusible');
    expect(titles).toContain('VIII. Protection AC — sectionneur');
    const viIndex = titles.indexOf('VI. Structure et lestage');
    const viiIndex = titles.indexOf('VII. Protection DC — fusible');
    const viiiIndex = titles.indexOf('VIII. Protection AC — sectionneur');
    const ixIndex = titles.indexOf('IX. Conclusion');
    expect(viIndex).toBeLessThan(viiIndex);
    expect(viiIndex).toBeLessThan(viiiIndex);
    expect(viiiIndex).toBeLessThan(ixIndex);
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('TOC section titles always match computeSectionNumbers() output exactly — never a second, separately hardcoded set of numerals (dcFuseRequired=%s, acIsolatorRequired=%s)', async (dcFuseRequired, acIsolatorRequired) => {
    // Regression test for a real bug the scoped re-review caught: the TOC titles were hardcoded
    // literal text, so they drifted out of sync with the body's own dynamically computed numbers
    // the moment VII/VIII weren't both present (the body said "VII. Conclusion", the TOC still
    // said "IX. Conclusion"). The TOC must use the SAME source of truth as the body template.
    const snapshot = {
      ...validSnapshot,
      engineInput: {
        ...validSnapshot.engineInput,
        dcFuse: dcFuseRequired ? { ratedCurrentA: 16, ratedVoltageV: 1000 } : null,
        acIsolator: acIsolatorRequired ? { ratedCurrentA: 25 } : null,
      },
    };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: snapshot });

    await processJob('job-1');

    const entries = mocks.renderTableOfContents.mock.calls[0]![0] as { title: string; pageNumber: number }[];
    const n = computeSectionNumbers(dcFuseRequired, acIsolatorRequired);
    expect(entries.map((e) => e.title)).toEqual(
      expect.arrayContaining([
        `${n.sectionNumberPreambule} Préambule`,
        `${n.sectionNumberPresentation} Présentation du projet`,
        `${n.sectionNumberSolution} Description de la solution technique`,
        `${n.sectionNumberCablage} Câblage`,
        `${n.sectionNumberTerre} Mise à la terre`,
        `${n.sectionNumberStructure} Structure et lestage`,
        `${n.sectionNumberConclusion} Conclusion`,
        ...(dcFuseRequired ? [`${n.sectionNumberFusible} Protection DC — fusible`] : []),
        ...(acIsolatorRequired ? [`${n.sectionNumberSectionneur} Protection AC — sectionneur`] : []),
      ]),
    );
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

  it('resolves company.logoFileId to a real buffer and passes it to both the cover page and the site-plan pages (I5)', async () => {
    mocks.companyFindUnique.mockResolvedValue({ name: 'SolarPro', address: 'Tunis', phone: '71000000', email: 'a@b.tn', logoFileId: 'file-logo', anmeCertificateFileId: null });
    mocks.fileFindUnique.mockResolvedValue({ id: 'file-logo', storageKey: 'logo.png', mimeType: 'png' });
    const logoBuffer = Buffer.from('fake-logo-png-bytes');
    mocks.readFile.mockImplementation((path: string) => Promise.resolve(path === '/fake/path' ? logoBuffer : Buffer.from('template bytes')));

    await processJob('job-1');

    expect(mocks.fileFindUnique).toHaveBeenCalledWith({ where: { id: 'file-logo' } });
    expect(mocks.renderCoverPage).toHaveBeenCalledWith(expect.objectContaining({ companyLogoBuffer: logoBuffer }));
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith(expect.objectContaining({ companyLogoBuffer: logoBuffer }));
  });

  it('does not fail the job when the logo file row exists but cannot be read from disk (I5 resilience)', async () => {
    mocks.companyFindUnique.mockResolvedValue({ name: 'SolarPro', address: 'Tunis', phone: '71000000', email: 'a@b.tn', logoFileId: 'file-missing-logo', anmeCertificateFileId: null });
    mocks.fileFindUnique.mockResolvedValue({ id: 'file-missing-logo', storageKey: 'gone.png', mimeType: 'png' });
    mocks.readFile.mockImplementation((path: string) => (path === '/fake/path' ? Promise.reject(new Error('ENOENT')) : Promise.resolve(Buffer.from('template bytes'))));

    await processJob('job-1');

    expect(mocks.renderCoverPage).toHaveBeenCalledWith(expect.objectContaining({ companyLogoBuffer: null }));
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('fetches a page-37 view covering the site and every placed point, and a separate lower-zoom page-38 view centred on the site', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    const site = { lat: 36.8, lon: 10.2 };
    const placed = [{ lat: 36.801, lon: 10.201 }, { lat: 36.799, lon: 10.199 }];

    await processJob('job-1');

    expect(mocks.fetchSatelliteImage).toHaveBeenCalledTimes(2);
    const implantationView = planImplantationView([site, ...placed]);
    const situationView = planSituationView(site);
    expect(mocks.fetchSatelliteImage).toHaveBeenNthCalledWith(1, implantationView);
    expect(mocks.fetchSatelliteImage).toHaveBeenNthCalledWith(2, situationView);
    expect(situationView.zoom).toBeLessThan(implantationView.zoom);
    for (const p of [site, ...placed]) {
      expect(isInsideImage(implantationView, projectToImage(implantationView, p))).toBe(true);
    }
  });

  it('hands the vision call and the renderer the placed points projected to image PIXELS (null when not placed)', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    const site = { lat: 36.8, lon: 10.2 };
    const view = planImplantationView([site, { lat: 36.801, lon: 10.201 }, { lat: 36.799, lon: 10.199 }]);
    const expectedPoints = {
      technicalRoom: projectToImage(view, { lat: 36.801, lon: 10.201 }),
      meter: projectToImage(view, { lat: 36.799, lon: 10.199 }),
      earthPit: null,
    };

    await processJob('job-1');

    expect(mocks.generatePage37Layout).toHaveBeenCalledWith(
      expect.objectContaining({
        satelliteImage: SATELLITE_TILE,
        imageWidthPx: view.widthPx,
        imageHeightPx: view.heightPx,
        sitePoint: projectToImage(view, site),
        points: expectedPoints,
      }),
      expect.anything(),
    );
    const situationView = planSituationView(site);
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith({
      tier: 'PREMIUM',
      clientFullName: 'Ahmed',
      clientAddress: 'Tunis',
      gps: { lat: 36.8, lon: 10.2 },
      installerName: 'SolarPro',
      installerContact: { address: 'Tunis', phone: '71000000', email: 'a@b.tn' },
      companyLogoBuffer: null,
      dossierDate: '2026-10-03',
      dossierNumber: null,
      premiumData: {
        page37: { image: { buffer: SATELLITE_TILE, widthPx: view.widthPx, heightPx: view.heightPx }, layout: PAGE_37_LAYOUT, points: expectedPoints },
        page38: { image: { buffer: SATELLITE_TILE, widthPx: situationView.widthPx, heightPx: situationView.heightPx }, sitePin: projectToImage(situationView, site) },
      },
    });
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('skips the vision call for a PREMIUM project with NO map point placed, and renders the satellite photo without an overlay', async () => {
    const noPoints = {
      ...premiumSnapshot,
      site: { ...premiumSnapshot.site, technicalRoomPointLat: null, technicalRoomPointLon: null, meterPointLat: null, meterPointLon: null },
    };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: noPoints });

    await processJob('job-1');

    expect(mocks.generatePage37Layout).not.toHaveBeenCalled();
    expect(mocks.fetchSatelliteImage).toHaveBeenCalledTimes(2);
    const renderInput = mocks.renderSitePlanPages.mock.calls[0]![0] as { tier: string; premiumData: { page37: { layout: unknown; points: unknown } } };
    expect(renderInput.tier).toBe('PREMIUM');
    expect(renderInput.premiumData.page37.layout).toBeNull();
    expect(renderInput.premiumData.page37.points).toEqual({ technicalRoom: null, meter: null, earthPit: null });
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('retries the vision call when Claude returns a coordinate outside the image, instead of drawing it or failing at once', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    mocks.generatePage37Layout.mockRejectedValueOnce(new Page37LayoutOutOfBoundsError('wireRoute point (9999, 1) is outside the image'));

    await processJob('job-1');

    expect(mocks.generatePage37Layout).toHaveBeenCalledTimes(2);
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

describe('processJob — PVGIS production simulation (mandatory, first step)', () => {
  function failedUpdate(): { status: string; failedStep: string; failureReason: string } | undefined {
    const call = mocks.dossierJobUpdate.mock.calls.find((c) => (c[0] as { data: { status?: string } }).data.status === 'FAILED');
    return (call?.[0] as { data: { status: string; failedStep: string; failureReason: string } } | undefined)?.data;
  }

  it('fails the job without calling Claude when PVGIS is down', async () => {
    mocks.simulateProduction.mockRejectedValue(new PvgisFetchError(403, 'PVGIS request failed with status 403'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await processJob('job-1');

    expect(failedUpdate()).toMatchObject({ status: 'FAILED', failedStep: 'simulation', failureReason: PVGIS_DOWN_REASON });
    expect(mocks.simulateProduction).toHaveBeenCalledTimes(1); // a 403 is not retried
    expect(mocks.generateDossierDocument).not.toHaveBeenCalled();
    expect(mocks.saveFile).not.toHaveBeenCalled();
    expect(mocks.projectSimulationUpsert).not.toHaveBeenCalled();
    expect(findSucceededUpdate()).toBeUndefined();
    error.mockRestore();
  });

  it('simulates at the installation point', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project-1',
      inputSnapshot: { ...validSnapshot, site: { ...validSnapshot.site, installationPointLat: 36.8012, installationPointLon: 10.2034 } },
    });

    await processJob('job-1');

    expect(mocks.runEngine).toHaveBeenCalledWith(validSnapshot.engineInput);
    expect(mocks.simulateProduction).toHaveBeenCalledWith({
      lat: 36.8012,
      lon: 10.2034,
      tiltDeg: 30,
      azimuthDeg: 0,
      module: validSnapshot.engineInput.module,
      moduleCount: 5,
      inverterPacW: 4000,
      dcVoltageDropPct: 0.74,
      acVoltageDropPct: 0.48,
    });
    expect(mocks.simulateProduction.mock.invocationCallOrder[0]!).toBeLessThan(mocks.generateDossierDocument.mock.invocationCallOrder[0]!);
  });

  it('simulates at the site GPS with its azimuth when no installation point is placed, and treats missing voltage drops as 0', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project-1',
      inputSnapshot: { ...validSnapshot, site: { ...validSnapshot.site, azimuthDeg: -20 } },
    });
    mocks.runEngine.mockReturnValue({ derived: {}, checks: [], hasBlockingFailure: false });

    await processJob('job-1');

    expect(mocks.simulateProduction).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 36.8, lon: 10.2, tiltDeg: 30, azimuthDeg: -20, dcVoltageDropPct: 0, acVoltageDropPct: 0 }),
    );
  });

  it('stores the simulation figures on success', async () => {
    await processJob('job-1');

    const figures = {
      source: 'PVGIS_LIVE',
      annualProductionKWh: 5400,
      specificYieldKWhPerKWp: 5400 / 3.1,
      performanceRatioPct: 81.5,
      systemLossesPct: null,
      pvsystReportFileId: null,
    };
    expect(mocks.projectSimulationUpsert).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      create: { projectId: 'project-1', ...figures },
      update: figures,
    });
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('retries a transient PVGIS network failure', async () => {
    mocks.simulateProduction.mockRejectedValueOnce(new TypeError('fetch failed'));

    await processJob('job-1');

    expect(mocks.simulateProduction).toHaveBeenCalledTimes(2);
    expect(findSucceededUpdate()).toBeDefined();
  });

  it.each([
    ['the site is not located', { site: null }],
    ['the site has no tilt', { site: { gpsLat: 36.8, gpsLon: 10.2 } }],
  ])('fails at "simulation" with no PVGIS or Claude call when %s', async (_label, override) => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: { ...premiumSnapshot, ...override } });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await processJob('job-1');

    expect(failedUpdate()).toMatchObject({ failedStep: 'simulation', failureReason: PVGIS_DOWN_REASON });
    expect(mocks.simulateProduction).not.toHaveBeenCalled();
    expect(mocks.generateDossierDocument).not.toHaveBeenCalled();
    expect(mocks.fetchSatelliteImage).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
