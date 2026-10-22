import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  renderPanelWiringDiagram: vi.fn(),
  renderDcBoxDiagram: vi.fn(),
  renderAcBoxDiagram: vi.fn(),
  generatePage37Layout: vi.fn(),
  fetchSatelliteImage: vi.fn(),
  renderSitePlanPages: vi.fn(),
  renderTableOfContents: vi.fn(),
  findHeadingPages: vi.fn(),
  saveFile: vi.fn(),
  readFile: vi.fn(),
  getFilePath: vi.fn(),
  simulateProduction: vi.fn(),
  runEngine: vi.fn(),
  projectSimulationUpsert: vi.fn(),
  catalogSourceDocumentFindUnique: vi.fn(),
  buildListPageAnnex: vi.fn(),
  dropBlankTrailingPages: vi.fn(),
  tryLoadStegLogo: vi.fn(),
  applyDraftWatermark: vi.fn(),
  stampStudyPages: vi.fn(),
  renderProductionReport: vi.fn(),
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
      catalogSourceDocument: { findUnique: mocks.catalogSourceDocumentFindUnique },
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
vi.mock('../src/merge-annexes', async () => ({
  ...(await vi.importActual<typeof import('../src/merge-annexes')>('../src/merge-annexes')),
  mergeAnnexes: mocks.mergeAnnexes,
  mergeDocumentFragments: mocks.mergeDocumentFragments,
}));
vi.mock('../src/clean-pdf-annex', async () => {
  const actual = await vi.importActual<typeof import('../src/clean-pdf-annex')>('../src/clean-pdf-annex');
  mocks.dropBlankTrailingPages.mockImplementation(actual.dropBlankTrailingPages);
  return { ...actual, dropBlankTrailingPages: mocks.dropBlankTrailingPages };
});
vi.mock('../src/render-cover-page', async () => ({
  ...(await vi.importActual<typeof import('../src/render-cover-page')>('../src/render-cover-page')),
  renderCoverPage: mocks.renderCoverPage,
}));
vi.mock('../src/stamp-study-pages', () => ({ stampStudyPages: mocks.stampStudyPages }));
vi.mock('../src/steg-logo', () => ({ tryLoadStegLogo: mocks.tryLoadStegLogo }));
vi.mock('../src/draft-watermark', async () => ({
  ...(await vi.importActual<typeof import('../src/draft-watermark')>('../src/draft-watermark')),
  applyDraftWatermark: mocks.applyDraftWatermark,
}));
vi.mock('../src/render-drawings', () => ({
  renderSingleLineDiagram: mocks.renderDrawingPages,
  renderPanelWiringDiagram: mocks.renderPanelWiringDiagram,
  renderDcBoxDiagram: mocks.renderDcBoxDiagram,
  renderAcBoxDiagram: mocks.renderAcBoxDiagram,
}));
vi.mock('../src/render-production-report', () => ({ renderProductionReport: mocks.renderProductionReport }));
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
vi.mock('../src/render-toc', () => ({ renderTableOfContents: mocks.renderTableOfContents, findHeadingPages: mocks.findHeadingPages }));
vi.mock('../src/steg-list-annex', () => ({ buildListPageAnnex: mocks.buildListPageAnnex }));
vi.mock('@dossipv/file-storage', () => ({ saveFile: mocks.saveFile, getFilePath: mocks.getFilePath }));
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, readFile: mocks.readFile };
});

import { PvgisFetchError } from '@dossipv/pvgis-client';
import { computeRunLengthsM, formatRunLengthFormula, groundDistanceM } from '@dossipv/engine';
import { processJob, IMPLANTATION_VIEW_OPTIONS } from '../src/process-job';
import type { ProductionSimulation } from '../src/run-simulation';
import { planImplantationView, planSituationView, projectToImage, isInsideImage, metersPerPixel, MapboxAuthError, TileHttpError, type SatelliteView } from '../src/fetch-satellite-image';
import type { SitePlanData } from '../src/render-site-plan-pages';
import { Page37LayoutOutOfBoundsError } from '../src/generate-page-37-layout';
import { DRAFT_INSERTED_PAGE_COUNT } from '../src/draft-watermark';
import { extractPdfContent, pageText } from './helpers/pdf-content';
import { INVERTER_MODELS, syntheticInverterDatasheet } from './helpers/synthetic-datasheet';

const validSnapshot = {
  version: 1,
  projectId: 'project-1',
  companyId: 'company-1',
  engineInput: {
    dossierDate: '2026-10-03',
    array: [{ inverter: { pacW: 4000, vdcMaxV: 1000, mpptMinV: 80, mpptMaxV: 550 }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] }],
    dcFuse: null,
    acIsolator: null,
    module: { pmaxW: 620, vmpV: 41.2, impA: 15.05, vocV: 49.3, iscA: 15.85, weightKg: 24 },
    structure: { ballastPerFrame: 0, ballastMassKg: 0, windSpeedKmh: 120, tiltDeg: 30 },
    dcRun: { sectionMm2: 6, lengthM: 20 },
    site: { phases: 1 },
    acRun: { sectionMm2: 10, lengthM: 15 },
    // The protection devices every real engine input carries (read by the protection notes).
    dcSwitch: { ratedVoltageV: 600, ratedCurrentA: 25 },
    dcSpd: { ucV: 700, inKA: 10, iscpvKA: 0.02, upKV: 2, type: 2 },
    acBreaker: { ratedCurrentA: 20 },
    acSpd: { ucV: 275, upKV: 1.5, type: 2 },
    equipmentImpulseWithstandKV: 4,
    spdToEquipmentDistanceM: 1,
  },
  projectMeta: {
    moduleBrandModel: 'X', inverterBrandModel: 'Y', gridType: 'TT', mountingType: 'ROOF', structureMaterial: 'ALUMINUM', earthRodCount: 1, earthingMode: 'DEDICATED_ROD', buildingType: 'HOUSE', floors: 1,
    protections: { dcSwitch: 'S', dcSpd: 'P', dcFuse: null, acBreaker: 'B', acSpd: 'Q' },
    acBreakerFunction: 'disjoncteur différentiel 16 A, 30 mA type A',
  },
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
const STEG_LOGO = Buffer.from('fake-steg-logo-png');
/** The Company columns processJob reads (identity, accreditation, logo, agreement). */
const COMPANY = {
  name: 'SolarPro',
  address: 'Tunis',
  phone: '71000000',
  email: 'a@b.tn',
  anmeCode: 'ANME-TEST-01',
  anmeCategory: 'BT',
  anmeValidTo: new Date('2027-12-31T00:00:00.000Z'),
  taxId: null,
  legalRepFullName: 'MR TEST GERANT',
  legalRepRole: 'Gérant',
  commercialRegister: null,
};
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
  pvgis: { radiationDb: 'PVGIS-SARAH3', meteoDb: 'ERA5', elevationM: 4, useHorizon: true, horizonSource: 'DEM-calculated', fetchedAt: '2026-10-22T15:25:00.000Z' },
  simulatedAt: '2026-10-22T15:25:02.000Z',
  annualNominalKWh: 6324,
  losses: { temperaturePct: 6.7, dcCablePct: 0.9, inverterEfficiencyPct: 3, clippingPct: 0, acCablePct: 0.5, totalPct: 14.6 },
  pvcalc: null,
};
const PVGIS_DOWN_REASON = "PVGIS indisponible : le dossier n'a pas été généré. Réessayez plus tard.";
// Every company carries its ANME agreement: a job without one fails before any work.
const ANME_ROW = { id: 'file-anme', mimeType: 'pdf', storageKey: 'anme.pdf' };
let bodyPdf: Buffer;
let drawingsPdf: Buffer;
// A real 2-page PDF (pages 37-38 always render exactly 2 pages, both tiers) — processJob now
// reads this fragment's own page count (for the TOC's Annexes entry), so it must be a real,
// loadable PDF like bodyPdf/drawingsPdf, not a recognisable fake buffer.
let sitePlanPdf: Buffer;
// The PVGIS report (annex N°2) is three real pages: the bordereau counts them.
let simulationReportPdf: Buffer;

function findSucceededUpdate(): unknown {
  return mocks.dossierJobUpdate.mock.calls.find((call) => (call[0] as { data: { status?: string } }).data.status === 'SUCCEEDED');
}

beforeEach(async () => {
  vi.clearAllMocks();
  bodyPdf = await makePdf(3);
  drawingsPdf = await makePdf(2);
  sitePlanPdf = await makePdf(2);
  simulationReportPdf = await makePdf(3);
  mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: validSnapshot });
  mocks.companyFindUnique.mockResolvedValue({ ...COMPANY, logoFileId: null, anmeCertificateFileId: 'file-anme' });
  mocks.projectFindUnique.mockResolvedValue({ annexes: null });
  mocks.fileFindMany.mockResolvedValue([ANME_ROW]);
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
  mocks.mergeDocumentFragments.mockResolvedValue({ pdf: ASSEMBLED_PDF, skipped: [] });
  mocks.renderCoverPage.mockResolvedValue(COVER_PDF);
  mocks.renderDrawingPages.mockResolvedValue(drawingsPdf);
  // Headings spread evenly over the body's real page range, first on page 1 and last on the last page.
  mocks.findHeadingPages.mockImplementation(async (pdf: Buffer, headings: string[]) => {
    const pages = (await PDFDocument.load(pdf)).getPageCount();
    return headings.map((_, i) => 1 + Math.round((i / Math.max(1, headings.length - 1)) * (pages - 1)));
  });
  mocks.renderPanelWiringDiagram.mockResolvedValue(drawingsPdf);
  mocks.renderDcBoxDiagram.mockResolvedValue(drawingsPdf);
  mocks.renderAcBoxDiagram.mockResolvedValue(drawingsPdf);
  mocks.renderProductionReport.mockResolvedValue(simulationReportPdf);
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
  mocks.catalogSourceDocumentFindUnique.mockResolvedValue(null);
  mocks.buildListPageAnnex.mockResolvedValue(null);
  mocks.tryLoadStegLogo.mockResolvedValue(STEG_LOGO);
  // Stamping is checked on its own (stamp-study-pages.test.ts); here it hands the PDF on unchanged.
  mocks.stampStudyPages.mockImplementation((pdf: Buffer) => Promise.resolve(pdf));
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

  it('fails at the snapshot step, without calling Claude, when projectMeta predates the protection references', async () => {
    const oldMeta = { ...validSnapshot.projectMeta, protections: undefined, acBreakerFunction: undefined };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project-1',
      inputSnapshot: { ...validSnapshot, projectMeta: oldMeta },
    });

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { failedStep: string; failureReason: string } };
    expect(failCall.data.failedStep).toBe('snapshot');
    expect(failCall.data.failureReason).toMatch(/relancez la génération/);
    expect(mocks.generateDossierDocument).not.toHaveBeenCalled();
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
  it('succeeds with a complete dossier when the project has no annex file uploaded (only the company agreement)', async () => {
    mocks.projectFindUnique.mockResolvedValue({ annexes: null });

    await processJob('job-1');

    // With no project upload, the annexes are the company's ANME agreement, the PVGIS report
    // (N°2) and the rendered drawings and plans (N°4-9).
    const mergeCalls = mocks.mergeDocumentFragments.mock.calls as [unknown[], { label: string }[]][];
    expect(mergeCalls[0]![1].map((a) => a.label)).toEqual([
      "Annexe N°1 — Agrément ANME de l'installateur",
      'Annexe N°2 — Rapport de simulation de production PVGIS',
      'Annexe N°4 — Schéma unifilaire',
      "Annexe N°5 — Plan d'implantation et de connexion",
      'Annexe N°6 — Plan de situation',
      'Annexe N°7 — Câblage des panneaux',
      'Annexe N°8 — Câblage du coffret DC',
      'Annexe N°9 — Câblage du coffret AC',
    ]);
    const finalUpdateCall = mocks.dossierJobUpdate.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === 'SUCCEEDED',
    );
    expect(finalUpdateCall).toBeDefined();
  });

  it('fails at "annexes" without PVGIS, Claude or the merge when the company has no ANME agreement', async () => {
    mocks.companyFindUnique.mockResolvedValue({ ...COMPANY, logoFileId: null, anmeCertificateFileId: null });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls[0]?.[0] as { data: { status: string; failedStep: string; failureReason: string } };
    expect(failCall.data).toMatchObject({
      status: 'FAILED',
      failedStep: 'annexes',
      failureReason: "Ajoutez l'attestation d'agrément ANME de votre société dans Paramètres avant de générer.",
    });
    expect(mocks.simulateProduction).not.toHaveBeenCalled();
    expect(mocks.generateDossierDocument).not.toHaveBeenCalled();
    expect(mocks.mergeDocumentFragments).not.toHaveBeenCalled();
    expect(mocks.saveFile).not.toHaveBeenCalled();
    error.mockRestore();
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
      ANME_ROW,
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
      ANME_ROW,
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
      ANME_ROW,
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
    const mergeCalls = mocks.mergeDocumentFragments.mock.calls as [unknown[], { buffer: Buffer; label: string }[]][];
    const annexes = mergeCalls[0]![1];
    expect(annexes.find((a) => a.label === 'Annexe N°1 — Dernière facture STEG')!.buffer).toBe(billBytes);
    expect(annexes.map((a) => a.label)).not.toContain('Annexe N°11 — Fiche technique LONGi X');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('file-module-datasheet'));
    expect((findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings).toEqual([
      // No STEG / ANME list is stored in this test.
      'Page de la liste STEG introuvable pour Y.',
      'Page de la liste ANME introuvable pour X.',
      'Annexe N°11 — Fiche technique LONGi X : fichier introuvable, non joint au dossier.',
    ]);
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

function sitePlanInput(): { planData: SitePlanData | null } {
  return mocks.renderSitePlanPages.mock.calls[0]![0] as { planData: SitePlanData | null };
}

describe('processJob — site plans (pages 37-38)', () => {
  it('still calls the AI layout for PREMIUM', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });

    await processJob('job-1');

    expect(mocks.renderCoverPage).toHaveBeenCalled();
    expect(mocks.renderDrawingPages).toHaveBeenCalled();
    expect(mocks.fetchSatelliteImage).toHaveBeenCalledTimes(2);
    expect(mocks.generatePage37Layout).toHaveBeenCalledTimes(1);
    expect(sitePlanInput().planData!.page37.layout).toEqual(PAGE_37_LAYOUT);
    expect(mocks.renderTableOfContents).toHaveBeenCalled();
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('fetches satellite plans for a STANDARD project without calling the AI layout', async () => {
    await processJob('job-1'); // validSnapshot's default tier is STANDARD

    expect(mocks.fetchSatelliteImage).toHaveBeenCalledTimes(2);
    expect(mocks.generatePage37Layout).not.toHaveBeenCalled();
    const planData = sitePlanInput().planData!;
    expect(planData.page37.image.buffer).toBe(SATELLITE_TILE);
    expect(planData.page38.image.buffer).toBe(SATELLITE_TILE);
    expect(planData.page37.layout).toBeNull();
    expect(planData.page37.dc).toEqual({ lengthM: 20, sectionMm2: 6, formula: null });
    expect(planData.page37.ac).toEqual({ lengthM: 15, sectionMm2: 10, formula: null });
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('does not fail the job when a tile fetch fails', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    mocks.fetchSatelliteImage.mockRejectedValue(new Error('Esri tile 404'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processJob('job-1');

    const planData = sitePlanInput().planData!;
    expect(planData.page37.image.buffer).toBeNull();
    expect(planData.page38.image.buffer).toBeNull();
    expect(planData.page37.points.technicalRoom).not.toBeNull();
    // No photo to reason on: the AI layout is skipped rather than failing the job.
    expect(mocks.generatePage37Layout).not.toHaveBeenCalled();
    // The placeholder annex bytes are not PDFs, so their blank-page cleaning warns too: not counted here.
    expect(warn.mock.calls.filter(([message]) => !String(message).includes('could not be cleaned'))).toHaveLength(2);
    expect(findSucceededUpdate()).toBeDefined();
    warn.mockRestore();
  });

  it('keeps the page-38 photo when only the page-37 fetch fails', async () => {
    mocks.fetchSatelliteImage.mockRejectedValueOnce(new Error('Esri tile 404'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processJob('job-1');

    const planData = sitePlanInput().planData!;
    expect(planData.page37.image.buffer).toBeNull();
    expect(planData.page38.image.buffer).toBe(SATELLITE_TILE);
    expect(findSucceededUpdate()).toBeDefined();
    warn.mockRestore();
  });

  it('gives the plans the run lengths, sections, GPS and formulas from the placed points', async () => {
    const field = { lat: 36.8, lon: 10.2 };
    const technicalRoom = { lat: 36.80008, lon: 10.20012 };
    const meter = { lat: 36.79985, lon: 10.20021 };
    const earthPit = { lat: 36.80011, lon: 10.20003 };
    const lengths = computeRunLengthsM({ field, technicalRoom, meter }, 1);
    const snapshot = {
      ...validSnapshot,
      engineInput: { ...validSnapshot.engineInput, dcRun: { sectionMm2: 6, lengthM: lengths.dcLengthM }, acRun: { sectionMm2: 10, lengthM: lengths.acLengthM } },
      site: {
        ...validSnapshot.site,
        installationPointLat: field.lat,
        installationPointLon: field.lon,
        floors: 1,
        technicalRoomPointLat: technicalRoom.lat,
        technicalRoomPointLon: technicalRoom.lon,
        meterPointLat: meter.lat,
        meterPointLon: meter.lon,
        earthPitPointLat: earthPit.lat,
        earthPitPointLon: earthPit.lon,
      },
    };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: snapshot });

    await processJob('job-1');

    const view = planImplantationView([field, technicalRoom, meter, earthPit], IMPLANTATION_VIEW_OPTIONS);
    const situationView = planSituationView(field);
    expect(mocks.fetchSatelliteImage).toHaveBeenNthCalledWith(1, view);
    expect(mocks.fetchSatelliteImage).toHaveBeenNthCalledWith(2, situationView);
    const planData = sitePlanInput().planData!;
    expect(planData.page37.image).toEqual({ buffer: SATELLITE_TILE, widthPx: view.widthPx, heightPx: view.heightPx, metersPerPixel: metersPerPixel(view, field.lat) });
    expect(planData.page37.points).toEqual({
      field: projectToImage(view, field),
      technicalRoom: projectToImage(view, technicalRoom),
      meter: projectToImage(view, meter),
      earthPit: projectToImage(view, earthPit),
    });
    expect(planData.page37.gps).toEqual({ field, technicalRoom, meter, earthPit });
    const dcFormula = formatRunLengthFormula(groundDistanceM(field, technicalRoom), lengths.dcLengthM, 1, 'DC');
    const acFormula = formatRunLengthFormula(groundDistanceM(technicalRoom, meter), lengths.acLengthM, 1, 'AC');
    expect(dcFormula).not.toBeNull();
    expect(acFormula).not.toBeNull();
    expect(planData.page37.dc).toEqual({ lengthM: lengths.dcLengthM, sectionMm2: 6, formula: dcFormula });
    expect(planData.page37.ac).toEqual({ lengthM: lengths.acLengthM, sectionMm2: 10, formula: acFormula });
    expect(planData.page38).toEqual({
      image: { buffer: SATELLITE_TILE, widthPx: situationView.widthPx, heightPx: situationView.heightPx, metersPerPixel: metersPerPixel(situationView, field.lat) },
      sitePin: projectToImage(situationView, field),
    });
    for (const p of [field, technicalRoom, meter, earthPit]) {
      expect(isInsideImage(view, projectToImage(view, p))).toBe(true);
    }
  });

  it('prints the entered length instead of a formula when the installer edited the run', async () => {
    const snapshot = {
      ...validSnapshot,
      engineInput: { ...validSnapshot.engineInput, dcRun: { sectionMm2: 6, lengthM: 99 } },
      site: { ...validSnapshot.site, floors: 0, technicalRoomPointLat: 36.80008, technicalRoomPointLon: 10.20012, meterPointLat: 36.79985, meterPointLon: 10.20021 },
    };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: snapshot });

    await processJob('job-1');

    expect(sitePlanInput().planData!.page37.dc).toEqual({ lengthM: 99, sectionMm2: 6, formula: null });
  });
});

/** Typed as unknown so a matcher nested in an expected object does not trip the no-unsafe-assignment rule. */
const has = (shape: Record<string, unknown>): unknown => expect.objectContaining(shape);
const arr = (items: unknown[]): unknown => expect.arrayContaining(items);

describe('processJob — fragment assembly details', () => {
  it('merges cover → TOC → body → divider into dossier.pdf, then the drawings and plans as annexes, and the divider + annexes into annexes.pdf', async () => {
    await processJob('job-1');

    const [dossierCall, annexesCall] = mocks.mergeDocumentFragments.mock.calls as [Buffer[], { buffer: Buffer; label: string }[]][];
    expect(dossierCall![0].slice(0, 3)).toEqual([COVER_PDF, TOC_PDF, bodyPdf]);
    expect(dossierCall![0]).toHaveLength(4);
    const dividerText = (await extractPdfContent(dossierCall![0][3]!)).map(pageText).join('\n');
    expect(dividerText).toContain('ANNEXES');
    expect(dividerText).toContain('Bordereau des annexes');
    // After the divider: the N°1 agreement, the PVGIS report (N°2), then the drawings and plans
    // as annexes N°4-6.
    const annexes = dossierCall![1];
    expect(annexes[0]!.label).toBe("Annexe N°1 — Agrément ANME de l'installateur");
    expect(annexes[1]!.buffer).toBe(simulationReportPdf);
    expect(annexes[2]!.buffer).toBe(drawingsPdf);
    expect((await PDFDocument.load(annexes[3]!.buffer)).getPageCount()).toBe(1);
    expect((await PDFDocument.load(annexes[4]!.buffer)).getPageCount()).toBe(1);
    expect(annexesCall![1]).toEqual(annexes);
    expect(annexesCall![0]).toHaveLength(1);
    expect(mocks.saveFile).toHaveBeenCalledWith(ASSEMBLED_PDF, 'dossier.pdf', 'application/pdf');
    expect(mocks.saveFile).toHaveBeenCalledWith(ASSEMBLED_PDF, 'annexes.pdf', 'application/pdf');
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('points the TOC Annexes entry at the divider, right after the body (C3)', async () => {
    mocks.convertDocxToPdf.mockResolvedValue(await makePdf(5));

    await processJob('job-1');

    // Cover = page 1, TOC = page 2, body = pages 3-7, divider = page 8.
    const entries = mocks.renderTableOfContents.mock.calls[0]![0] as { title: string; pageNumber: number }[];
    expect(entries.find((e) => e.title === 'Annexes')?.pageNumber).toBe(8);
    expect(entries.find((e) => e.title === 'Schémas électriques')).toBeUndefined();
    expect(entries.find((e) => e.title === 'Plans de situation')).toBeUndefined();
  });

  it('lists every in-body section (I-VI, IX, and the conditional VII/VIII), each within the body page range and in increasing order — never pointing at the TOC itself or out of order (C3)', async () => {
    // engineInput's default fixture has dcFuse: null, acIsolator: null, so VII/VIII are both absent
    // — the most common configuration the final review flagged as skipping straight from VI to IX.
    mocks.convertDocxToPdf.mockResolvedValue(await makePdf(2));

    await processJob('job-1');

    const entries = mocks.renderTableOfContents.mock.calls[0]![0] as { title: string; pageNumber: number }[];
    // Conclusion is "X." here (not a hardcoded "IX.") — with no DC fuse and no AC isolator,
    // VI is directly followed by VII, exactly matching computeSectionNumbers()'s own output
    // (see build-template-data.test.ts's identical no-gap assertion for the body side).
    const bodyTitles = ['I. Préambule', 'II. Présentation du projet', 'III. Dimensionnement et productible', 'IV. Description de la solution technique', 'V. Dimensionnement des protections', 'VI. Câblage', 'VII. Mise à la terre', 'VIII. Structure et lestage', 'IX. Vérifications réglementaires', 'X. Conclusion'];
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
    expect(entries.find((e) => e.title.endsWith('Protection DC — fusible'))).toBeUndefined();
    expect(entries.find((e) => e.title.endsWith('Protection AC — sectionneur'))).toBeUndefined();
  });

  it('lists the dimensioning and production section right after the project presentation in the TOC', async () => {
    await processJob('job-1');

    const entries = mocks.renderTableOfContents.mock.calls[0]![0] as { title: string }[];
    const titles = entries.map((e) => e.title);
    expect(titles).toContain('III. Dimensionnement et productible');
    expect(titles.indexOf('III. Dimensionnement et productible')).toBe(titles.indexOf('II. Présentation du projet') + 1);
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
    expect(titles).toContain('IX. Protection DC — fusible');
    expect(titles).toContain('X. Protection AC — sectionneur');
    const viIndex = titles.indexOf('VIII. Structure et lestage');
    const viiIndex = titles.indexOf('IX. Protection DC — fusible');
    const viiiIndex = titles.indexOf('X. Protection AC — sectionneur');
    const ixIndex = titles.indexOf('XII. Conclusion');
    expect(titles).toContain('XI. Vérifications réglementaires');
    expect(viIndex).toBeGreaterThan(-1);
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
        `${n.sectionNumberDimensionnement} Dimensionnement et productible`,
        `${n.sectionNumberSolution} Description de la solution technique`,
        `${n.sectionNumberProtections} Dimensionnement des protections`,
        `${n.sectionNumberCablage} Câblage`,
        `${n.sectionNumberTerre} Mise à la terre`,
        `${n.sectionNumberStructure} Structure et lestage`,
        `${n.sectionNumberCompliance} Vérifications réglementaires`,
        `${n.sectionNumberConclusion} Conclusion`,
        ...(dcFuseRequired ? [`${n.sectionNumberFusible} Protection DC — fusible`] : []),
        ...(acIsolatorRequired ? [`${n.sectionNumberSectionneur} Protection AC — sectionneur`] : []),
      ]),
    );
    // 10 body sections always present, the conditional ones, and « Annexes ».
    expect(entries).toHaveLength(10 + (dcFuseRequired ? 1 : 0) + (acIsolatorRequired ? 1 : 0) + 1);
  });

  it("hands the AC surge arrester's In from the frozen catalog row to the protection notes", async () => {
    const snapshot = { ...validSnapshot, protections: { acSpd: { id: 'spd-ac', brand: 'TEST', model: 'AC-40', inKA: 20 } } };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: snapshot });

    await processJob('job-1');

    const data = mocks.fillDossierTemplate.mock.calls[0]![1] as { protectionNotes: { title: string; result: string }[] };
    expect(data.protectionNotes.find((note) => note.title === 'Parafoudre AC')!.result).toContain('In = 20 kA ≥ 5 kA');
  });

  it('builds the cover page and the drawings from the company and the frozen snapshot', async () => {
    await processJob('job-1');

    expect(mocks.renderCoverPage).toHaveBeenCalledWith({
      installer: {
        name: 'SolarPro',
        address: 'Tunis',
        phone: '71000000',
        email: 'a@b.tn',
        anmeCode: 'ANME-TEST-01',
        anmeCategory: 'BT',
        anmeValidTo: '2027-12-31T00:00:00.000Z',
        taxId: null,
        legalRepFullName: 'MR TEST GERANT',
        legalRepRole: 'Gérant',
        commercialRegister: null,
      },
      companyLogoBuffer: null,
      stegLogoBuffer: STEG_LOGO,
      dossierNumber: null,
      dossierDate: '2026-10-03',
      client: { fullName: 'Ahmed', cin: null, address: 'Tunis', stegReference: 'STEG-1' },
      gps: { lat: 36.8, lon: 10.2 },
      installedKWp: 3.1,
    });
    expect(mocks.renderDrawingPages).toHaveBeenCalledWith(
      has({
        pvField: has({ moduleRef: 'X', moduleCount: 5, strings: 1, modulesPerString: 5 }),
        dcCable: has({ sectionMm2: 6, lengthM: 20 }),
        acCable: has({ sectionMm2: 10, lengthM: 15 }),
        earthing: has({ mode: 'DEDICATED_ROD' }),
        inverter: has({ lines: arr(['Pac 4 kW']) }),
        cartouche: has({ installerName: COMPANY.name, dossierNumber: null }),
      }),
    );
    expect(mocks.renderPanelWiringDiagram).toHaveBeenCalledWith(has({ strings: [{ modules: 5 }], moduleRef: 'X' }));
    expect(mocks.renderDcBoxDiagram).toHaveBeenCalledWith(has({ strings: 1, dcCable: has({ lengthM: 20 }) }));
    expect(mocks.renderAcBoxDiagram).toHaveBeenCalledWith(has({ acCable: has({ lengthM: 15 }) }));
  });

  it('hands the drawings the differential breaker and the AGCP rating of the subscribed power', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project-1',
      inputSnapshot: {
        ...validSnapshot,
        client: { ...validSnapshot.client, subscribedPowerKVA: 7 },
        engineInput: { ...validSnapshot.engineInput, rcd: { residualCurrentMA: 30, rcdType: 'A' } },
      },
    });

    await processJob('job-1');

    expect(mocks.renderDrawingPages).toHaveBeenCalledWith(
      has({
        acBreaker: has({ lines: arr(['30 mA type A']) }),
        agcp: { calibreA: '30/32' },
      }),
    );
    expect(mocks.renderAcBoxDiagram).toHaveBeenCalledWith(expect.objectContaining({ agcp: { calibreA: '30/32' } }));
  });

  it('passes the installer identity, number and dossier date to the template data', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project-1',
      inputSnapshot: { ...validSnapshot, dossierNumber: '434 - 303', client: { ...validSnapshot.client, cin: '01234567' } },
    });

    await processJob('job-1');

    const data = mocks.fillDossierTemplate.mock.calls[0]?.[1] as Record<string, string>;
    expect(data.dossierNumber).toBe('434 - 303');
    expect(data.dossierDateText).toBe('03/10/2026');
    expect(data.installerAnmeLine).toBe("Installateur agréé ANME n° ANME-TEST-01 (catégorie BT), agrément valable jusqu'au 31/12/2027");
    expect(data.installerTaxIdLine).toBe('Matricule fiscal : non renseigné');
    expect(data.clientCinLine).toBe('CIN : 01234567');
    expect(mocks.renderCoverPage).toHaveBeenCalledWith(expect.objectContaining({ dossierNumber: '434 - 303' }));
  });

  it('renders the cover without the STEG logo and warns, never failing, while the logo file is absent', async () => {
    mocks.tryLoadStegLogo.mockResolvedValue(null);

    await processJob('job-1');

    expect(mocks.renderCoverPage).toHaveBeenCalledWith(expect.objectContaining({ stegLogoBuffer: null }));
    const update = findSucceededUpdate() as [{ data: { warnings: string[] } }];
    expect(update[0].data.warnings).toContain('Logo STEG absent : ajoutez steg-logo.png dans les ressources du worker.');
  });

  it('treats an unreadable STEG logo like an absent one', async () => {
    mocks.tryLoadStegLogo.mockRejectedValue(new Error('EACCES'));

    await processJob('job-1');

    expect(mocks.renderCoverPage).toHaveBeenCalledWith(expect.objectContaining({ stegLogoBuffer: null }));
    expect((findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings).toContain('Logo STEG absent : ajoutez steg-logo.png dans les ressources du worker.');
  });

  it('resolves company.logoFileId to a real buffer and passes it to both the cover page and the site-plan pages (I5)', async () => {
    mocks.companyFindUnique.mockResolvedValue({ ...COMPANY, logoFileId: 'file-logo', anmeCertificateFileId: 'file-anme' });
    mocks.fileFindUnique.mockResolvedValue({ id: 'file-logo', storageKey: 'logo.png', mimeType: 'png' });
    const logoBuffer = Buffer.from('fake-logo-png-bytes');
    mocks.readFile.mockImplementation((path: string) => Promise.resolve(path === '/fake/path' ? logoBuffer : Buffer.from('template bytes')));

    await processJob('job-1');

    expect(mocks.fileFindUnique).toHaveBeenCalledWith({ where: { id: 'file-logo' } });
    expect(mocks.renderCoverPage).toHaveBeenCalledWith(expect.objectContaining({ companyLogoBuffer: logoBuffer }));
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith(expect.objectContaining({ companyLogoBuffer: logoBuffer }));
  });

  it('does not fail the job when the logo file row exists but cannot be read from disk (I5 resilience)', async () => {
    mocks.companyFindUnique.mockResolvedValue({ ...COMPANY, logoFileId: 'file-missing-logo', anmeCertificateFileId: 'file-anme' });
    mocks.fileFindUnique.mockResolvedValue({ id: 'file-missing-logo', storageKey: 'gone.png', mimeType: 'png' });
    // Only the logo's bytes are gone; the ANME agreement (a required annex) is still readable.
    mocks.getFilePath.mockImplementation((storageKey: string) => (storageKey === 'gone.png' ? '/fake/path' : `/storage/${storageKey}`));
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
    const implantationView = planImplantationView([site, ...placed], IMPLANTATION_VIEW_OPTIONS);
    const situationView = planSituationView(site);
    // Esri's native imagery stops at zoom 18 outside the large cities (zoom 19 is a "Map data not
    // yet available" tile there).
    expect(implantationView.zoom).toBeLessThanOrEqual(18);
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
    const technicalRoom = { lat: 36.801, lon: 10.201 };
    const meter = { lat: 36.799, lon: 10.199 };
    const view = planImplantationView([site, technicalRoom, meter], IMPLANTATION_VIEW_OPTIONS);
    const expectedPoints = {
      technicalRoom: projectToImage(view, technicalRoom),
      meter: projectToImage(view, meter),
      earthPit: null,
    };

    await processJob('job-1');

    expect(mocks.generatePage37Layout).toHaveBeenCalledWith(
      expect.objectContaining({
        satelliteImage: SATELLITE_TILE,
        imageWidthPx: view.widthPx,
        imageHeightPx: view.heightPx,
        metersPerPixel: metersPerPixel(view, site.lat),
        sitePoint: projectToImage(view, site),
        points: expectedPoints,
      }),
      expect.anything(),
    );
    const situationView = planSituationView(site);
    expect(mocks.renderSitePlanPages).toHaveBeenCalledWith({
      clientFullName: 'Ahmed',
      clientAddress: 'Tunis',
      gps: { lat: 36.8, lon: 10.2 },
      installerName: 'SolarPro',
      installerAnmeCode: 'ANME-TEST-01',
      installerContact: { address: 'Tunis', phone: '71000000', email: 'a@b.tn' },
      companyLogoBuffer: null,
      dossierDate: '2026-10-03',
      dossierNumber: null,
      planData: {
        page37: {
          image: { buffer: SATELLITE_TILE, widthPx: view.widthPx, heightPx: view.heightPx, metersPerPixel: metersPerPixel(view, site.lat) },
          layout: PAGE_37_LAYOUT,
          points: { field: projectToImage(view, site), ...expectedPoints },
          gps: { field: site, technicalRoom, meter, earthPit: null },
          // No floors in this snapshot and lengths typed by hand: no formula.
          dc: { lengthM: 20, sectionMm2: 6, formula: null },
          ac: { lengthM: 15, sectionMm2: 10, formula: null },
        },
        page38: {
          image: { buffer: SATELLITE_TILE, widthPx: situationView.widthPx, heightPx: situationView.heightPx, metersPerPixel: metersPerPixel(situationView, site.lat) },
          sitePin: projectToImage(situationView, site),
        },
      },
    });
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('skips the vision call for a PREMIUM project with NO map point placed, and still draws the field point', async () => {
    const noPoints = {
      ...premiumSnapshot,
      site: { ...premiumSnapshot.site, technicalRoomPointLat: null, technicalRoomPointLon: null, meterPointLat: null, meterPointLon: null },
    };
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: noPoints });

    await processJob('job-1');

    expect(mocks.generatePage37Layout).not.toHaveBeenCalled();
    expect(mocks.fetchSatelliteImage).toHaveBeenCalledTimes(2);
    const planData = sitePlanInput().planData!;
    expect(planData.page37.layout).toBeNull();
    expect(planData.page37.points).toEqual({ field: projectToImage(planImplantationView([{ lat: 36.8, lon: 10.2 }], IMPLANTATION_VIEW_OPTIONS), { lat: 36.8, lon: 10.2 }), technicalRoom: null, meter: null, earthPit: null });
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

describe('processJob — draft dossiers (STEG pieces missing)', () => {
  const DOSSIER_PDF = Buffer.from('%PDF-fake-dossier');
  const ANNEXES_PDF = Buffer.from('%PDF-fake-annexes');
  const WATERMARKED_PDF = Buffer.from('%PDF-fake-watermarked');
  const MISSING = ['Copie de la CIN du titulaire', 'Autorisation du syndic ou des copropriétaires'];

  beforeEach(() => {
    mocks.mergeDocumentFragments
      .mockResolvedValueOnce({ pdf: DOSSIER_PDF, skipped: [] })
      .mockResolvedValueOnce({ pdf: ANNEXES_PDF, skipped: [] });
    mocks.applyDraftWatermark.mockResolvedValue(WATERMARKED_PDF);
  });

  it('watermarks dossier.pdf of a draft and leaves annexes.pdf as it is', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: { ...validSnapshot, draftMissing: MISSING } });

    await processJob('job-1');

    expect(mocks.applyDraftWatermark).toHaveBeenCalledTimes(1);
    expect(mocks.applyDraftWatermark).toHaveBeenCalledWith(DOSSIER_PDF, MISSING);
    expect(mocks.saveFile).toHaveBeenCalledWith(WATERMARKED_PDF, 'dossier.pdf', 'application/pdf');
    expect(mocks.saveFile).toHaveBeenCalledWith(ANNEXES_PDF, 'annexes.pdf', 'application/pdf');
    // The Word body carries the same notice under its title.
    expect(mocks.fillDossierTemplate.mock.calls[0]?.[1]).toMatchObject({
      isDraft: true,
      draftMissingText: 'Copie de la CIN du titulaire ; Autorisation du syndic ou des copropriétaires',
    });
    expect(findSucceededUpdate()).toBeDefined();
  });

  it('leaves a complete dossier untouched', async () => {
    await processJob('job-1');

    expect(mocks.applyDraftWatermark).not.toHaveBeenCalled();
    expect(mocks.saveFile).toHaveBeenCalledWith(DOSSIER_PDF, 'dossier.pdf', 'application/pdf');
    expect(mocks.fillDossierTemplate.mock.calls[0]?.[1]).toMatchObject({ isDraft: false, draftMissingText: '' });
  });

  /** The TOC entries and the dossier.pdf bordereau's page column of the last processJob run. */
  async function printedPageNumbers(): Promise<{ toc: { title: string; pageNumber: number }[]; bordereau: Record<string, string | undefined> }> {
    const toc = mocks.renderTableOfContents.mock.calls.at(-1)![0] as { title: string; pageNumber: number }[];
    const dividerPdf = (mocks.mergeDocumentFragments.mock.calls.at(-2) as [Buffer[]])[0][3]!;
    const divider = (await extractPdfContent(dividerPdf))[1]!;
    const pageOf = (title: string): string | undefined => {
      const row = divider.texts.find((t) => t.text === title);
      return row ? divider.texts.find((t) => t !== row && Math.abs(t.y - row.y) < 1 && t.x > row.x)?.text : undefined;
    };
    const titles = ['Simulation de production PVGIS', 'Schéma unifilaire', "Plan d'implantation et de connexion", 'Plan de situation'];
    return { toc, bordereau: Object.fromEntries(titles.map((title) => [title, pageOf(title)])) };
  }

  it('moves every TOC and bordereau page number of a draft by exactly the inserted page', async () => {
    await processJob('job-1');
    const complete = await printedPageNumbers();

    mocks.mergeDocumentFragments.mockResolvedValue({ pdf: DOSSIER_PDF, skipped: [] });
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: { ...validSnapshot, draftMissing: MISSING } });
    await processJob('job-1');
    const draft = await printedPageNumbers();

    // Cover 1, TOC 2, body 3-5, divider 6-7; the unreadable N°1 takes no page, so the PVGIS report
    // fills 8-10 and the drawings open on 11.
    expect(complete.bordereau['Simulation de production PVGIS']).toBe('8');
    expect(complete.bordereau['Schéma unifilaire']).toBe('11');
    expect(draft.toc.map((entry) => entry.title)).toEqual(complete.toc.map((entry) => entry.title));
    expect(draft.toc.map((entry) => entry.pageNumber)).toEqual(complete.toc.map((entry) => entry.pageNumber + 1));
    for (const [title, page] of Object.entries(complete.bordereau)) {
      expect(page, title).toMatch(/^\d+$/);
      expect(draft.bordereau[title], title).toBe(String(Number(page) + 1));
    }
    // annexes.pdf is not watermarked: its own bordereau keeps counting from its page 1.
    const annexesDivider = async (call: number): Promise<string> =>
      JSON.stringify((await extractPdfContent((mocks.mergeDocumentFragments.mock.calls[call] as [Buffer[]])[0][0]!))[1]!.texts.map((t) => t.text));
    expect(await annexesDivider(3)).toBe(await annexesDivider(1));
  });

  /**
   * Runs processJob with the real merge, stamp and watermark on labelled synthetic fragments
   * (cover, TOC, a 3-page body, drawings, plans) and returns dossier.pdf's page texts and the TOC.
   */
  async function assembleForReal(draftMissing: string[]): Promise<{ pages: string[]; toc: { title: string; pageNumber: number }[]; saved: Buffer }> {
    const actualWatermark = await vi.importActual<typeof import('../src/draft-watermark')>('../src/draft-watermark');
    const actualMerge = await vi.importActual<typeof import('../src/merge-annexes')>('../src/merge-annexes');
    mocks.applyDraftWatermark.mockImplementation(actualWatermark.applyDraftWatermark);
    const actualStamp = await vi.importActual<typeof import('../src/stamp-study-pages')>('../src/stamp-study-pages');
    mocks.stampStudyPages.mockImplementation(actualStamp.stampStudyPages);
    mocks.mergeDocumentFragments.mockReset().mockImplementation(actualMerge.mergeDocumentFragments);
    const labelled = async (labels: string[]): Promise<Buffer> => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont((await import('pdf-lib')).StandardFonts.Helvetica);
      for (const label of labels) doc.addPage([595, 842]).drawText(label, { x: 50, y: 780, size: 14, font });
      return Buffer.from(await doc.save());
    };
    mocks.renderCoverPage.mockResolvedValue(await labelled(['MARQUE COUVERTURE']));
    mocks.renderTableOfContents.mockResolvedValue(await labelled(['MARQUE SOMMAIRE']));
    mocks.convertDocxToPdf.mockResolvedValue(await labelled(['MARQUE CORPS 1', 'MARQUE CORPS 2', 'MARQUE CORPS 3']));
    mocks.renderDrawingPages.mockResolvedValue(await labelled(['MARQUE SCHEMA 1', 'MARQUE SCHEMA 2']));
    mocks.renderSitePlanPages.mockResolvedValue(await labelled(['MARQUE IMPLANTATION', 'MARQUE SITUATION']));
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: { ...validSnapshot, draftMissing } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await processJob('job-1');
    warn.mockRestore();

    const saved = mocks.saveFile.mock.calls.find((call) => call[1] === 'dossier.pdf')![0] as Buffer;
    const pages = (await extractPdfContent(saved)).map((page) => pageText(page));
    const toc = mocks.renderTableOfContents.mock.calls.at(-1)![0] as { title: string; pageNumber: number }[];
    return { pages, toc, saved };
  }

  it('keeps every TOC and bordereau target on the right page once the real watermark is applied', async () => {
    const { pages, toc, saved } = await assembleForReal(MISSING);
    const onPage = (pageNumber: number): string => pages[pageNumber - 1] ?? '';
    expect(onPage(1)).toContain('MARQUE COUVERTURE');
    expect(onPage(2)).toContain('Pièces manquantes');
    expect(onPage(3)).toContain('MARQUE SOMMAIRE');

    expect(onPage(toc[0]!.pageNumber)).toContain('MARQUE CORPS 1');
    expect(onPage(toc.at(-2)!.pageNumber)).toContain('MARQUE CORPS 3');
    expect(onPage(toc.find((entry) => entry.title === 'Annexes')!.pageNumber)).toContain('ANNEXES');

    const bordereau = (await extractPdfContent(saved))[toc.find((entry) => entry.title === 'Annexes')!.pageNumber]!;
    const pageOf = (title: string): number => {
      const row = bordereau.texts.find((t) => t.text === title)!;
      return Number(bordereau.texts.find((t) => t !== row && Math.abs(t.y - row.y) < 1 && t.x > row.x)!.text);
    };
    expect(onPage(pageOf('Schéma unifilaire'))).toContain('MARQUE SCHEMA 1');
    expect(onPage(pageOf("Plan d'implantation et de connexion"))).toContain('MARQUE IMPLANTATION');
    expect(onPage(pageOf('Plan de situation'))).toContain('MARQUE SITUATION');
    for (const page of pages) expect(page).toContain('BROUILLON –');
  });

  /** The « Page n sur N » footer printed on a page, if any. */
  const footerOf = (page: string): string | undefined => /Page \d+ sur \d+/.exec(page)?.[0];

  it.each([
    ['a complete dossier', [] as string[], 0],
    ['a draft', MISSING, DRAFT_INSERTED_PAGE_COUNT],
  ])('prints, in %s, the footer « Page n sur N » that matches the TOC on every study page', async (_label, draftMissing, inserted) => {
    const { pages, toc } = await assembleForReal(draftMissing);
    const onPage = (pageNumber: number): string => pages[pageNumber - 1] ?? '';
    // Cover + TOC + 3 body pages, plus the draft's missing-pieces page.
    const studyPages = 5 + inserted;

    expect(footerOf(onPage(1))).toBeUndefined();
    for (let physical = 2 + inserted; physical <= studyPages; physical += 1) {
      expect(footerOf(onPage(physical)), `page ${physical}`).toBe(`Page ${physical} sur ${studyPages}`);
    }
    for (const entry of toc.filter((e) => e.title !== 'Annexes')) {
      expect(footerOf(onPage(entry.pageNumber)), entry.title).toBe(`Page ${entry.pageNumber} sur ${studyPages}`);
    }
    // The annex divider and the annexes keep their own pages, unnumbered.
    for (let physical = studyPages + 1; physical <= pages.length; physical += 1) {
      expect(footerOf(onPage(physical)), `page ${physical}`).toBeUndefined();
    }
  });

  it('stamps the study pages before the watermark, shifted by the missing-pieces page, and leaves annexes.pdf unstamped', async () => {
    const STAMPED_PDF = Buffer.from('%PDF-fake-stamped');
    mocks.stampStudyPages.mockResolvedValue(STAMPED_PDF);
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project-1',
      inputSnapshot: { ...validSnapshot, draftMissing: MISSING, dossierNumber: '434 - 303' },
    });

    await processJob('job-1');

    expect(mocks.stampStudyPages).toHaveBeenCalledTimes(1);
    expect(mocks.stampStudyPages).toHaveBeenCalledWith(DOSSIER_PDF, {
      studyPageCount: 5, // cover + TOC + the 3-page body
      logo: null,
      stegLogo: STEG_LOGO,
      installerName: 'SolarPro',
      dossierNumber: '434 - 303',
      pagesInsertedAfterCover: DRAFT_INSERTED_PAGE_COUNT,
    });
    expect(mocks.applyDraftWatermark).toHaveBeenCalledWith(STAMPED_PDF, MISSING);
    expect(mocks.saveFile).toHaveBeenCalledWith(ANNEXES_PDF, 'annexes.pdf', 'application/pdf');
  });

  it('stamps a complete dossier without shift, passing a missing STEG logo on as null', async () => {
    const STAMPED_PDF = Buffer.from('%PDF-fake-stamped');
    mocks.stampStudyPages.mockResolvedValue(STAMPED_PDF);
    mocks.tryLoadStegLogo.mockResolvedValue(null);

    await processJob('job-1');

    expect(mocks.stampStudyPages).toHaveBeenCalledWith(DOSSIER_PDF, expect.objectContaining({ studyPageCount: 5, stegLogo: null, pagesInsertedAfterCover: 0 }));
    expect(mocks.saveFile).toHaveBeenCalledWith(STAMPED_PDF, 'dossier.pdf', 'application/pdf');
  });

  it('fails the job at the assembly step when the study pages cannot be stamped', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.stampStudyPages.mockRejectedValue(new Error('corrupt'));

    await processJob('job-1');

    expect(mocks.dossierJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', failedStep: 'assembly' }) as object }),
    );
    expect(mocks.saveFile).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('fails the job at the assembly step when the watermark cannot be applied', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: { ...validSnapshot, draftMissing: MISSING } });
    mocks.applyDraftWatermark.mockRejectedValue(new Error('corrupt'));

    await processJob('job-1');

    expect(mocks.dossierJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', failedStep: 'assembly' }) as object }),
    );
    expect(mocks.saveFile).not.toHaveBeenCalled();
    error.mockRestore();
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
    { failedStep: 'map-pages', tier: 'STANDARD', arrange: () => mocks.renderSitePlanPages.mockRejectedValue(new Error('site plan boom')) },
    { failedStep: 'page-37-layout', tier: 'PREMIUM', arrange: () => mocks.generatePage37Layout.mockRejectedValue(new Error('page-37 layout boom')) },
    { failedStep: 'toc', tier: 'STANDARD', arrange: () => mocks.renderTableOfContents.mockRejectedValue(new Error('toc boom')) },
    { failedStep: 'assembly', tier: 'STANDARD', arrange: () => mocks.mergeDocumentFragments.mockRejectedValue(new Error('assembly boom')) },
    { failedStep: 'map-pages', tier: 'STANDARD', arrange: () => mocks.renderSitePlanPages.mockResolvedValue(Buffer.from('not a pdf')) },
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

  it('does not retry a PVGIS HTTP error, which the PVGIS client has already retried', async () => {
    mocks.simulateProduction.mockRejectedValue(new PvgisFetchError(503, 'PVGIS a rencontré une erreur serveur (HTTP 503).'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await processJob('job-1');

    expect(mocks.simulateProduction).toHaveBeenCalledTimes(1);
    expect(failedUpdate()).toMatchObject({ failedStep: 'simulation', failureReason: PVGIS_DOWN_REASON });
    error.mockRestore();
  });

  it('renders the PVGIS report from the simulation, the equipment and the installer, as annex N°2 with its page in the bordereau', async () => {
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: { ...validSnapshot, dossierNumber: '434 - 303' } });

    await processJob('job-1');

    expect(mocks.renderProductionReport).toHaveBeenCalledWith(PRODUCTION, {
      moduleRef: 'X',
      moduleCount: 5,
      inverterRef: 'Y',
      inverterPacW: 4000,
      dcDropPct: 0.74,
      acDropPct: 0.48,
      dossierNumber: '434 - 303',
      dossierDate: '2026-10-03',
      installerName: 'SolarPro',
      logo: null,
      stegLogo: STEG_LOGO,
      moduleSpecs: undefined, // this fixture's module has no temperature coefficient
    });
    const [dossierCall] = mocks.mergeDocumentFragments.mock.calls as [Buffer[], { label: string; buffer: Buffer }[]][];
    const report = dossierCall![1].find((a) => a.label === 'Annexe N°2 — Rapport de simulation de production PVGIS');
    expect(report?.buffer).toBe(simulationReportPdf);
    // Cover 1, TOC 2, body 3-5, divider 6-7; the N°1 agreement's stand-in bytes are no PDF, so it
    // takes no page and the report opens on page 8.
    const divider = (await extractPdfContent(dossierCall![0][3]!))[1]!;
    const row = divider.texts.find((t) => t.text === 'Simulation de production PVGIS');
    const page = divider.texts.find((t) => t !== row && Math.abs(t.y - row!.y) < 1 && t.x > row!.x)?.text;
    expect(page).toBe('8');
  });

  it('fails at "simulation-report", saving nothing, when the report cannot be rendered', async () => {
    mocks.renderProductionReport.mockRejectedValue(new Error('pdf-lib exploded'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await processJob('job-1');

    expect(failedUpdate()).toMatchObject({ failedStep: 'simulation-report', failureReason: 'La génération du rapport de simulation PVGIS a échoué.' });
    expect(mocks.saveFile).not.toHaveBeenCalled();
    error.mockRestore();
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

describe('processJob — table of contents', () => {
  it("prints each section's real body page, offset by the cover and the TOC", async () => {
    mocks.convertDocxToPdf.mockResolvedValue(await makePdf(5));
    mocks.findHeadingPages.mockImplementation((_pdf: Buffer, headings: string[]) => Promise.resolve(headings.map((_, i) => (i < 3 ? 1 : i < 6 ? 3 : 5))));

    await processJob('job-1');

    const toc = mocks.renderTableOfContents.mock.calls.at(-1)![0] as { title: string; pageNumber: number }[];
    expect(toc[0]!.pageNumber).toBe(3);
    expect(toc[3]!.pageNumber).toBe(5);
    expect(toc[6]!.pageNumber).toBe(7);
    expect(toc.at(-1)).toEqual({ title: 'Annexes', pageNumber: 8 });
  });

  it('keeps the previous page and warns when a heading is not found', async () => {
    mocks.convertDocxToPdf.mockResolvedValue(await makePdf(5));
    mocks.findHeadingPages.mockImplementation((_pdf: Buffer, headings: string[]) => Promise.resolve(headings.map((_, i) => (i === 0 ? 2 : i === 1 ? null : 4))));

    await processJob('job-1');

    const toc = mocks.renderTableOfContents.mock.calls.at(-1)![0] as { title: string; pageNumber: number }[];
    expect(toc[1]!.pageNumber).toBe(toc[0]!.pageNumber);
    const warnings = (findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings;
    expect(warnings).toContain(`Sommaire : titre « ${toc[1]!.title} » introuvable.`);
  });
});

describe('processJob — annex plan', () => {
  async function onePagePdf(width: number): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.addPage([width, 300]);
    return Buffer.from(await doc.save());
  }

  const files: Record<string, { mimeType: string; storageKey: string }> = {
    'file-anme': { mimeType: 'pdf', storageKey: 'anme.pdf' },
    'file-bill': { mimeType: 'pdf', storageKey: 'bill.pdf' },
    'file-structure': { mimeType: 'pdf', storageKey: 'structure.pdf' },
    'file-module': { mimeType: 'pdf', storageKey: 'module.pdf' },
    'file-inverter': { mimeType: 'pdf', storageKey: 'inverter.pdf' },
    'file-rcd': { mimeType: 'pdf', storageKey: 'rcd.pdf' },
    'file-broken': { mimeType: 'pdf', storageKey: 'broken.pdf' },
  };

  beforeEach(async () => {
    const bytes: Record<string, Buffer> = {};
    for (const [i, id] of Object.keys(files).entries()) {
      bytes[`/storage/${files[id]!.storageKey}`] = id === 'file-broken' ? Buffer.from('not a pdf') : await onePagePdf(100 + i);
    }
    mocks.getFilePath.mockImplementation((storageKey: string) => `/storage/${storageKey}`);
    mocks.readFile.mockImplementation((path: string) => Promise.resolve(bytes[path] ?? Buffer.from('template bytes')));
    mocks.fileFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map((id) => ({ id, ...files[id]! }))),
    );
    mocks.companyFindUnique.mockResolvedValue({ ...COMPANY, logoFileId: null, anmeCertificateFileId: 'file-anme' });
    mocks.projectFindUnique.mockResolvedValue({
      annexes: { cinFileId: null, commercialRegisterFileId: null, stegContractFileId: null, lastPaidBillFileId: 'file-bill', moduleAcceptanceFileId: null, extraFiles: [] },
      structure: { structureAttestationFileId: 'file-structure' },
    });
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue(annexJob('Y'));
  });

  function annexJob(inverterModel: string, inverterFileId = 'file-inverter'): unknown {
    return {
      id: 'job-1',
      projectId: 'project-1',
      inputSnapshot: {
        ...validSnapshot,
        arrayConfig: {
          module: { brand: 'LONGi', model: 'X', datasheetFileId: 'file-module' },
          inverters: [{ inverter: { brand: 'Sofar', model: inverterModel, datasheetFileId: inverterFileId }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] }],
        },
        protections: {
          acBreaker: { brand: 'Hager', model: 'RCBO', residualCurrentMA: 30, datasheetFileId: 'file-rcd' },
          dcSpd: { brand: 'Citel', model: 'DS', datasheetFileId: 'file-broken' },
        },
      },
    };
  }

  // The blank one-page datasheets of this block have no text layer: nothing can be highlighted.
  const NO_HIGHLIGHT_WARNINGS = [
    'Surlignage impossible dans Annexe N°11 — Fiche technique LONGi X (document scanné ou modèle introuvable).',
    'Surlignage impossible dans Annexe N°12 — Fiche technique Sofar Y (document scanné ou modèle introuvable).',
  ];

  it('cleans only the ADMIN-slot PDFs of blank trailing pages', async () => {
    await processJob('job-1');

    // Annex N°1: the ANME agreement and the bill (slot ADMIN) are cleaned; nothing else is.
    expect(mocks.dropBlankTrailingPages).toHaveBeenCalledTimes(2);
  });

  it('keeps the original file and logs a warning when cleaning an ADMIN PDF fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.dropBlankTrailingPages.mockRejectedValue(new Error('boom'));

    await processJob('job-1');

    const annexes = (mocks.mergeDocumentFragments.mock.calls[0] as [Buffer[], { label: string }[]])[1];
    expect(annexes.some((a) => a.label.includes('Agrément ANME'))).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be cleaned'), expect.any(Error));
    expect((findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings.some((w) => w.includes('nettoy'))).toBe(false);
    warn.mockRestore();
  });

  it('merges the inverter datasheet with the model column highlighted, and warns for the text-less module datasheet', async () => {
    const inverterSheet = await syntheticInverterDatasheet('columns');
    const actualRead = mocks.readFile.getMockImplementation() as (path: string) => Promise<Buffer>;
    mocks.readFile.mockImplementation((path: string) => (path === '/storage/inverter.pdf' ? Promise.resolve(inverterSheet) : actualRead(path)));
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue(annexJob(INVERTER_MODELS[1]));

    await processJob('job-1');

    const annexes = (mocks.mergeDocumentFragments.mock.calls[0] as [Buffer[], { label: string; buffer: Buffer }[]])[1];
    const inverter = annexes.find((a) => a.label === `Annexe N°12 — Fiche technique Sofar ${INVERTER_MODELS[1]}`)!;
    const amber = (await extractPdfContent(inverter.buffer))[0]!.paths.filter((p) => JSON.stringify(p.fill) === JSON.stringify([1, 0.82, 0]));
    expect(amber.length).toBeGreaterThan(0);
    expect((findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings).toEqual([
      'Page de la liste STEG introuvable pour SUN-5K-G04.',
      'Page de la liste ANME introuvable pour X.',
      NO_HIGHLIGHT_WARNINGS[0],
    ]);
  });

  it('keeps the original datasheet with a warning, and still succeeds, when the highlighter throws', async () => {
    // file-broken is not a PDF: the text extraction throws inside the inverter highlighter.
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue(annexJob('Y', 'file-broken'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processJob('job-1');

    expect(findSucceededUpdate()).toBeDefined();
    const annexes = (mocks.mergeDocumentFragments.mock.calls[0] as [Buffer[], { label: string; buffer: Buffer }[]])[1];
    expect(annexes.find((a) => a.label === 'Annexe N°12 — Fiche technique Sofar Y')!.buffer.toString()).toBe('not a pdf');
    expect((findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings).toContain(NO_HIGHLIGHT_WARNINGS[1]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be highlighted'), expect.anything());
    warn.mockRestore();
  });

  it('merges the annex documents in physical order, the drawings and plans after the administrative papers', async () => {
    await processJob('job-1');

    const annexes = (mocks.mergeDocumentFragments.mock.calls[0] as [Buffer[], { label: string }[]])[1];
    expect(annexes.map((a) => a.label)).toEqual([
      "Annexe N°1 — Agrément ANME de l'installateur",
      'Annexe N°1 — Dernière facture STEG',
      'Annexe N°2 — Rapport de simulation de production PVGIS',
      'Annexe N°3 — Attestation de conformité de la structure',
      'Annexe N°4 — Schéma unifilaire',
      "Annexe N°5 — Plan d'implantation et de connexion",
      'Annexe N°6 — Plan de situation',
      'Annexe N°7 — Câblage des panneaux',
      'Annexe N°8 — Câblage du coffret DC',
      'Annexe N°9 — Câblage du coffret AC',
      'Annexe N°11 — Fiche technique LONGi X',
      'Annexe N°12 — Fiche technique Sofar Y',
      'Annexe N°14 — Fiche technique Citel DS',
      'Annexe N°18 — Fiche technique Hager RCBO',
    ]);
  });

  it('prints each annex start page in the bordereau, with a dash for the empty and unreadable ones, an unreadable one marked as not attached', async () => {
    mocks.convertDocxToPdf.mockResolvedValue(await makePdf(5));

    await processJob('job-1');

    // Body = pages 3-7, divider = pages 8-9; ADMIN 10-11, PVGIS report 12-14, STRUCTURE 15,
    // drawings 16-17, implantation 18, situation 19, panel wiring 20-21, DC box 22-23, AC box 24-25, module 26, inverter 27, (DC SPD unreadable), RCD 28.
    const divider = (await extractPdfContent((mocks.mergeDocumentFragments.mock.calls[0] as [Buffer[]])[0][3]!))[1]!;
    const pageOf = (title: string): string | undefined => {
      const row = divider.texts.find((t) => t.text === title);
      return row ? divider.texts.find((t) => t !== row && Math.abs(t.y - row.y) < 1 && t.x > row.x)?.text : undefined;
    };
    expect(pageOf('Dossier administratif')).toBe('10');
    expect(pageOf('Simulation de production PVGIS')).toBe('12');
    expect(pageOf('Attestation de conformité de la structure')).toBe('15');
    expect(pageOf('Schéma unifilaire')).toBe('16');
    expect(pageOf('Plan de situation')).toBe('19');
    expect(pageOf('Câblage des panneaux')).toBe('20');
    expect(pageOf('Fiche technique du module')).toBe('26');
    expect(pageOf('Disjoncteur différentiel')).toBe('28');
    expect(pageOf('Parafoudre DC (document non joint)')).toBe('—');
    expect(pageOf('Chemin de câbles (sans objet)')).toBe('—');
  });

  it('saves the skipped annexes as DossierJob.warnings', async () => {
    mocks.mergeDocumentFragments.mockResolvedValue({ pdf: ASSEMBLED_PDF, skipped: ['Annexe N°14 — Fiche technique Citel DS'] });

    await processJob('job-1');

    const update = findSucceededUpdate() as [{ data: { warnings: string[] } }];
    expect(update[0].data.warnings).toEqual([
      'Page de la liste STEG introuvable pour Y.',
      'Page de la liste ANME introuvable pour X.',
      ...NO_HIGHLIGHT_WARNINGS,
      'Annexe N°14 — Fiche technique Citel DS : document illisible, non joint au dossier.',
    ]);
  });

  describe('STEG and ANME list pages', () => {
    const LIST_ROWS: Record<string, { file: { storageKey: string } }> = {
      STEG_INVERTER_LIST: { file: { storageKey: 'steg-list.pdf' } },
      ANME_PANEL_LIST: { file: { storageKey: 'anme-list.pdf' } },
    };
    const stegList = Buffer.from('%PDF-steg-list');
    const anmeList = Buffer.from('%PDF-anme-list');

    beforeEach(async () => {
      const listPage = await onePagePdf(500);
      const actualRead = mocks.readFile.getMockImplementation() as (path: string) => Promise<Buffer>;
      mocks.readFile.mockImplementation((path: string) =>
        path === '/storage/steg-list.pdf' ? Promise.resolve(stegList) : path === '/storage/anme-list.pdf' ? Promise.resolve(anmeList) : actualRead(path),
      );
      mocks.catalogSourceDocumentFindUnique.mockImplementation(({ where }: { where: { kind: string } }) => Promise.resolve({ kind: where.kind, ...LIST_ROWS[where.kind]! }));
      mocks.buildListPageAnnex.mockImplementation((_list: Buffer, model: string) => Promise.resolve({ page: listPage, pageNumber: model === 'Y' ? 2 : 7 }));
    });

    it('annexes the STEG list page under N°10 and, without an acceptance letter, the ANME list page under N°11', async () => {
      await processJob('job-1');

      expect(mocks.buildListPageAnnex).toHaveBeenCalledWith(stegList, 'Y');
      expect(mocks.buildListPageAnnex).toHaveBeenCalledWith(anmeList, 'X');
      const labels = (mocks.mergeDocumentFragments.mock.calls[0] as [Buffer[], { label: string }[]])[1].map((a) => a.label);
      expect(labels.slice(10)).toEqual([
        'Annexe N°11 — Fiche technique LONGi X',
        'Annexe N°11 — Liste ANME des panneaux acceptés — page 7',
        'Annexe N°12 — Fiche technique Sofar Y',
        'Annexe N°10 — Liste STEG des onduleurs acceptés — page 2',
        'Annexe N°14 — Fiche technique Citel DS',
        'Annexe N°18 — Fiche technique Hager RCBO',
      ]);
      expect((findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings).toEqual(NO_HIGHLIGHT_WARNINGS);
    });

    it('leaves the ANME list page out when the module has an acceptance letter', async () => {
      mocks.projectFindUnique.mockResolvedValue({
        annexes: { cinFileId: null, commercialRegisterFileId: null, stegContractFileId: null, lastPaidBillFileId: 'file-bill', moduleAcceptanceFileId: 'file-module', extraFiles: [] },
        structure: { structureAttestationFileId: 'file-structure' },
      });

      await processJob('job-1');

      expect(mocks.buildListPageAnnex).toHaveBeenCalledTimes(1);
      expect(mocks.catalogSourceDocumentFindUnique).not.toHaveBeenCalledWith(expect.objectContaining({ where: { kind: 'ANME_PANEL_LIST' } }));
      const labels = (mocks.mergeDocumentFragments.mock.calls[0] as [Buffer[], { label: string }[]])[1].map((a) => a.label);
      expect(labels.filter((l) => l.includes('Liste ANME'))).toEqual([]);
    });

    it('warns and appends nothing when the list does not name the model or cannot be read', async () => {
      mocks.buildListPageAnnex.mockResolvedValue(null);
      const actualRead = mocks.readFile.getMockImplementation() as (path: string) => Promise<Buffer>;
      mocks.readFile.mockImplementation((path: string) =>
        path === '/storage/anme-list.pdf' ? Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })) : actualRead(path),
      );
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await processJob('job-1');

      expect(findSucceededUpdate()).toBeDefined();
      const labels = (mocks.mergeDocumentFragments.mock.calls[0] as [Buffer[], { label: string }[]])[1].map((a) => a.label);
      expect(labels.filter((l) => l.includes('Liste '))).toEqual([]);
      expect((findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings).toEqual([
        'Page de la liste STEG introuvable pour Y.',
        'Page de la liste ANME introuvable pour X.',
        ...NO_HIGHLIGHT_WARNINGS,
      ]);
      warn.mockRestore();
    });
  });

  it('fails at "annexes" when the uploaded structure attestation is missing on disk', async () => {
    const actualRead = mocks.readFile.getMockImplementation() as (path: string) => Promise<Buffer>;
    mocks.readFile.mockImplementation((path: string) =>
      path === '/storage/structure.pdf' ? Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })) : actualRead(path),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await processJob('job-1');

    const failCall = mocks.dossierJobUpdate.mock.calls.find((call) => (call[0] as { data: { status?: string } }).data.status === 'FAILED');
    expect((failCall![0] as { data: { failedStep: string } }).data.failedStep).toBe('annexes');
    error.mockRestore();
  });
});

describe('processJob — Mapbox imagery', () => {
  const originalEnv = { a: process.env.MAPBOX_ACCESS_TOKEN, b: process.env.NEXT_PUBLIC_MAPBOX_TOKEN };
  afterEach(() => {
    for (const [key, value] of [['MAPBOX_ACCESS_TOKEN', originalEnv.a], ['NEXT_PUBLIC_MAPBOX_TOKEN', originalEnv.b]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('plans the implantation view beyond zoom 18 and credits Mapbox when a token is set', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test-secret-token';
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });

    await processJob('job-1');

    const view = mocks.fetchSatelliteImage.mock.calls[0]![0] as SatelliteView;
    expect(view.zoom).toBeGreaterThan(18);
    const planData = sitePlanInput().planData!;
    expect(planData.page37.image.provider).toBe('mapbox');
    expect(planData.page38.image.provider).toBe('mapbox');
    const update = findSucceededUpdate() as [{ data: { warnings: string[] } }];
    expect(JSON.stringify(update[0].data.warnings)).not.toContain('pk.test-secret-token');
  });

  it('stays on Esri (zoom <= 18, no provider credit) without a token', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });

    await processJob('job-1');

    expect((mocks.fetchSatelliteImage.mock.calls[0]![0] as SatelliteView).zoom).toBeLessThanOrEqual(18);
    expect(sitePlanInput().planData!.page37.image.provider).toBeUndefined();
  });

  it('warns once and re-plans on Esri when Mapbox refuses the token', async () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test-secret-token';
    delete process.env.MAPBOX_ACCESS_TOKEN;
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    mocks.fetchSatelliteImage.mockRejectedValueOnce(new MapboxAuthError(401));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processJob('job-1');

    const calls = mocks.fetchSatelliteImage.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]!.length).toBe(1);
    expect(calls[1]![1]).toBe('esri');
    expect((calls[1]![0] as SatelliteView).zoom).toBeLessThanOrEqual(18);
    const planData = sitePlanInput().planData!;
    expect(planData.page37.image.buffer).toBe(SATELLITE_TILE);
    expect(planData.page37.image.provider).toBeUndefined();
    const warnings = (findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings;
    expect(warnings).toContain('Imagerie Mapbox refusée : vérifiez MAPBOX_ACCESS_TOKEN.');
    expect(JSON.stringify([warnings, warn.mock.calls])).not.toContain('pk.test-secret-token');
    warn.mockRestore();
  });

  it('warns once for the one plan whose imagery failed (partial failure); the other keeps its photo', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test-secret-token';
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    mocks.fetchSatelliteImage.mockRejectedValueOnce(new TileHttpError(404, 'Mapbox tile fetch failed with status 404 for https://x/?access_token=REDACTED'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processJob('job-1');

    const planData = sitePlanInput().planData!;
    expect(planData.page37.image.buffer).toBeNull();
    expect(planData.page38.image.buffer).toBe(SATELLITE_TILE);
    const warnings = (findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings;
    expect(warnings.filter((w) => w.startsWith('Fond satellite indisponible'))).toEqual(["Fond satellite indisponible pour le plan d'implantation : plan dessiné sans fond."]);
    warn.mockRestore();
  });

  it('on a 401 for the second plan only, warns once and redoes both plans on Esri', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test-secret-token';
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    mocks.fetchSatelliteImage.mockResolvedValueOnce(SATELLITE_TILE).mockRejectedValueOnce(new MapboxAuthError(401));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processJob('job-1');

    const calls = mocks.fetchSatelliteImage.mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[2]![1]).toBe('esri');
    expect(calls[3]![1]).toBe('esri');
    const warnings = (findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings;
    expect(warnings.filter((w) => w.startsWith('Imagerie Mapbox refusée'))).toHaveLength(1);
    expect(warnings.some((w) => w.startsWith('Fond satellite indisponible'))).toBe(false);
    expect(JSON.stringify([warnings, warn.mock.calls])).not.toContain('pk.test-secret-token');
    warn.mockRestore();
  });

  it('degrades to a plain background (no failure) when the Mapbox fetch fails otherwise', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test-secret-token';
    mocks.dossierJobFindUniqueOrThrow.mockResolvedValue({ id: 'job-1', projectId: 'project-1', inputSnapshot: premiumSnapshot });
    mocks.fetchSatelliteImage.mockRejectedValue(new Error('Mapbox tile 404'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processJob('job-1');

    expect(sitePlanInput().planData!.page37.image.buffer).toBeNull();
    expect(findSucceededUpdate()).toBeDefined();
    const warnings = (findSucceededUpdate() as [{ data: { warnings: string[] } }])[0].data.warnings;
    expect(warnings).toContain("Fond satellite indisponible pour le plan d'implantation : plan dessiné sans fond.");
    expect(warnings).toContain('Fond satellite indisponible pour le plan de situation : plan dessiné sans fond.');
    expect(JSON.stringify([warnings, warn.mock.calls])).not.toContain('pk.test-secret-token');
    warn.mockRestore();
  });
});
