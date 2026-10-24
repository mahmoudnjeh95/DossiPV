import { readFile } from 'fs/promises';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import { PvgisFetchError } from '@dossipv/pvgis-client';
import { db } from '@dossipv/db';
import {
  fitSiteImage,
  formatRunLengthFormula,
  groundDistanceM,
  photoPixels,
  polygonAreaM2,
  runEngine,
  siteImageFitIssue,
  SITE_POINT_KINDS,
  type SitePointKind,
} from '@dossipv/engine';
import { getFilePath, saveFile } from '@dossipv/file-storage';
import { fillDossierTemplate } from '@dossipv/docx-template';
import { generateDossierDocument } from './generate-dossier-document';
import { buildTemplateData, computeSectionNumbers, type EarthingRow } from './build-template-data';
import { convertDocxToPdf } from './convert-to-pdf';
import { annexPageCount, mergeDocumentFragments, type AnnexFile } from './merge-annexes';
import {
  ANNEX_NUMBERS,
  annexDocumentsFromSnapshot,
  annexStartPages,
  buildAnnexPlan,
  physicalAnnexDocuments,
  type AnnexDocument,
  type AnnexEntry,
} from './annex-plan';
import { renderAnnexDivider, type AnnexDividerEntry } from './render-annex-divider';
import { parseJobSnapshot, type SnapshotSite, type WorkerJobSnapshot } from './job-snapshot';
import { simulateProduction, type ProductionSimulation, type ProductionSimulationInput } from './run-simulation';
import { withRetry, isRetryableError } from './retry';
import { renderCoverPage } from './render-cover-page';
import { tryLoadStegLogo } from './steg-logo';
import { installerIdentityFromCompany } from './installer-identity';
import { renderAcBoxDiagram, renderDcBoxDiagram, renderPanelWiringDiagram, renderSingleLineDiagram } from './render-drawings';
import { buildDrawingInputs } from './drawing-inputs';
import { buildEquipmentTables } from './equipment-tables';
import { renderProductionReport } from './render-production-report';
import { generatePage37Layout, isRetryablePage37LayoutError, type Page37Layout, type Page37Points } from './generate-page-37-layout';
import { generateRoofPlacement, isRetryableRoofPlacementError, type RoofPlacement } from './generate-roof-placement';
import {
  activeImageryProvider,
  fetchSatelliteImages,
  IMAGERY_ATTRIBUTION,
  isRetryableTileError,
  MapboxAuthError,
  MAPBOX_REFUSED_WARNING,
  MAX_NATIVE_ZOOM,
  type ImageryProvider,
  metersPerPixel,
  planImplantationView,
  planSituationView,
  projectToImage,
  type ImplantationViewOptions,
  type LatLon,
  type PixelPoint,
  type SatelliteView,
} from './fetch-satellite-image';
import { decodeJpegBitmap, encodeJpegBitmap, enhanceSatelliteImage, resizeLanczos, type Bitmap } from './image-enhance';
import { compactArrayFootprint, renderRoof3dView, type Roof3dInput } from './render-roof-3d';
import type { DrawingCartouche } from './drawing-kit';
import { renderSitePlanPages, type SitePlanData, type SitePlanPoints } from './render-site-plan-pages';
import { findHeadingPages, renderTableOfContents, type TocEntry } from './render-toc';
import { buildListPageAnnex } from './steg-list-annex';
import { dropBlankTrailingPages } from './clean-pdf-annex';
import { highlightInverterDatasheet, highlightModuleDatasheet } from './highlight';
import { applyDraftWatermark, DRAFT_INSERTED_PAGE_COUNT } from './draft-watermark';
import { stampStudyPages } from './stamp-study-pages';

const TEMPLATE_PATH = join(import.meta.dirname, '..', '..', 'docx-template', 'template', 'dossier-template.docx');
/** The study pages before the Word body: the cover (1) and the one-page table of contents (2). */
const STUDY_PAGE_COUNT_BEFORE_BODY = 2;

/**
 * Page 37's view: at most the provider's native zoom (Esri has no zoom-19 imagery outside the
 * large Tunisian cities and answers a "Map data not yet available" tile there), and at least
 * ≈ 60 m across at zoom 19: the imagery holds about 0,3 m of detail, so a tighter view only
 * enlarges blur, while this one shows the house, its roof and the street sharply.
 */
export const IMPLANTATION_VIEW_OPTIONS: ImplantationViewOptions = { maxZoom: MAX_NATIVE_ZOOM.esri, minSizePx: 240, paddingPx: 40 };

/** Page 37's options for a provider: only the zoom ceiling differs. Page 38 stays at zoom 17 on both. */
const implantationViewOptions = (provider: ImageryProvider): ImplantationViewOptions => ({ ...IMPLANTATION_VIEW_OPTIONS, maxZoom: MAX_NATIVE_ZOOM[provider] });

/**
 * A plan's satellite photo: `standard` at the view's own pixel size (what overlays and the AI layout
 * use) and `print`, the sharpest copy for the PDF (retina detail when the provider has it, then
 * Lanczos upscaling and an unsharp mask, so it holds up when zoomed in). Null (the caller records
 * the warning) when the tiles cannot be had.
 */
async function fetchPlanImage(jobId: string, view: SatelliteView, plan: string, provider?: ImageryProvider): Promise<{ standard: Buffer; print: Buffer } | null> {
  try {
    // A refused Mapbox token is not transient: no retry, the caller decides about the fallback.
    const images = await withRetry(() => (provider ? fetchSatelliteImages(view, provider) : fetchSatelliteImages(view)), { isRetryable: isRetryableTileError });
    // Retina tiles already carry 2× the detail: only sharpen them; upscale the standard ones.
    return { standard: images.standard, print: enhanceSatelliteImage(images.detailed ?? images.standard, images.detailed ? 1 : 2) };
  } catch (error) {
    if (error instanceof MapboxAuthError) throw error;
    console.warn(`processJob: job ${jobId}: the ${plan} plan's satellite image is unavailable; drawn without it.`, error);
    return null;
  }
}

export const ROOF_3D_MISSING_WARNING = "Vue de dessus de l'implantation indisponible (fond satellite manquant) : annexe N°5 sans sa feuille 2.";

export const INSTALLER_PHOTO_POINTS_WARNING =
  "Photo satellite importée : ses points ne correspondent plus à ceux de la carte (replacez-les sur la photo), le plan d'implantation garde l'imagerie par défaut.";
export const INSTALLER_PHOTO_UNREADABLE_WARNING = "Photo satellite importée illisible : le plan d'implantation garde l'imagerie par défaut.";
/** The installer's photo as Claude sees it and as page 37's pixel grid. */
const INSTALLER_PHOTO_VIEW_SIDE_PX = 1024;
/** The installer's photo as printed on the plans. */
const INSTALLER_PHOTO_PRINT_SIDE_PX = 2400;

interface InstallerPhoto {
  view: SatelliteView;
  images: { standard: Buffer; print: Buffer };
  /** Where the installer placed the points and the roof on the photo, in the view's pixels. */
  points: SitePlanPoints;
  roofOutline: PixelPoint[] | null;
}

/**
 * Page 37's photo from the installer's own capture, with the points and the roof placed again on
 * it: the view those points give the photo against the map (its scale and offset; every length
 * stays measured on the map), the photo scaled to that view (what Claude reasons on) and a larger
 * copy for print. Null when there is none, or, with a job warning, when it cannot be read or its
 * points no longer match the map (a point missing, or moved on the map since): the plan then
 * keeps Mapbox/Esri.
 */
async function loadInstallerPhoto(
  jobId: string,
  site: SnapshotSite,
  gps: Record<SitePointKind, LatLon | null>,
  warnings: string[],
): Promise<InstallerPhoto | null> {
  const placed = site.siteImagePoints;
  if (!site.siteImageFileId || !placed) return null;
  let photo: Bitmap;
  try {
    const file = await db.file.findUnique({ where: { id: site.siteImageFileId } });
    if (!file) throw new Error(`file ${site.siteImageFileId} is not in the database`);
    photo = decodeJpegBitmap(await readFile(getFilePath(file.storageKey)));
  } catch (error) {
    console.warn(`processJob: job ${jobId}: the imported satellite photo could not be used.`, error);
    warnings.push(INSTALLER_PHOTO_UNREADABLE_WARNING);
    return null;
  }
  const fit = (side: number): Bitmap => {
    const scale = side / Math.max(photo.width, photo.height);
    return scale < 1 ? resizeLanczos(photo, Math.round(photo.width * scale), Math.round(photo.height * scale)) : photo;
  };
  const standard = fit(INSTALLER_PHOTO_VIEW_SIDE_PX);
  const pixels = photoPixels(placed, standard.width, standard.height);
  const fitted = fitSiteImage(gps, pixels);
  const missing = SITE_POINT_KINDS.some((kind) => gps[kind] && !pixels[kind]) || (site.roofOutline !== null && pixels.roofOutline === null);
  if (!fitted || missing || siteImageFitIssue(fitted)) {
    warnings.push(INSTALLER_PHOTO_POINTS_WARNING);
    return null;
  }
  return {
    view: { zoom: fitted.zoom, originX: fitted.originX, originY: fitted.originY, widthPx: standard.width, heightPx: standard.height },
    images: { standard: encodeJpegBitmap(standard, 88), print: encodeJpegBitmap(fit(INSTALLER_PHOTO_PRINT_SIDE_PX), 90) },
    points: { field: pixels.field, technicalRoom: pixels.technicalRoom, meter: pixels.meter, earthPit: pixels.earthPit },
    roofOutline: pixels.roofOutline,
  };
}

const missingImageryWarning = (plan: string): string => `Fond satellite indisponible pour le plan ${plan} : plan dessiné sans fond.`;

// Reads ANTHROPIC_API_KEY from the environment automatically (the SDK's own default
// behavior) — no new env var convention needed for this worker specifically.
const anthropicClient = new Anthropic();

// Generic, step-specific French messages shown to the installer — never the raw error message,
// which can leak internals (file system paths, DB column/constraint names, SDK error bodies).
// The real error is logged server-side for operators via console.error in each catch block below.
const GENERIC_FAILURE_REASONS: Record<string, string> = {
  snapshot: 'Instantané de la saisie illisible, corrompu ou obsolète : relancez la génération du dossier depuis le projet.',
  simulation: "PVGIS indisponible : le dossier n'a pas été généré. Réessayez plus tard.",
  'simulation-report': 'La génération du rapport de simulation PVGIS a échoué.',
  text: 'La génération du texte du dossier a échoué.',
  docx: 'La génération du document Word a échoué.',
  pdf: 'La conversion en PDF a échoué.',
  cover: 'La génération de la page de garde a échoué.',
  drawings: 'La génération des schémas électriques a échoué.',
  'map-pages': 'La génération des plans de situation a échoué.',
  'page-37-layout': "L'analyse de l'image satellite pour le plan d'implantation a échoué.",
  toc: 'La génération de la table des matières a échoué.',
  assembly: "L'assemblage du dossier PDF a échoué.",
  annexes: 'La fusion des annexes a échoué.',
  save: "L'enregistrement du dossier a échoué.",
};

/** Job warning while the official STEG logo file has not been added to the worker's assets. */
export const STEG_LOGO_MISSING_WARNING = 'Logo STEG absent : ajoutez steg-logo.png dans les ressources du worker.';

/** No dossier without the company's ANME agreement (product owner, 2026-10-22). */
export const ANME_AGREEMENT_MISSING_REASON = "Ajoutez l'attestation d'agrément ANME de votre société dans Paramètres avant de générer.";

async function fail(jobId: string, failedStep: string, internalError: unknown, installerReason?: string): Promise<void> {
  // Operator-facing log of the real cause; DossierJob.failureReason itself only ever gets the
  // generic, installer-safe message below (or a fixed, installer-written `installerReason`).
  console.error(`processJob: job ${jobId} failed at step "${failedStep}":`, internalError);
  await db.dossierJob.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      failedStep,
      failureReason: installerReason ?? GENERIC_FAILURE_REASONS[failedStep] ?? 'La génération du dossier a échoué.',
      completedAt: new Date(),
    },
  });
}

/**
 * Records the step the job has entered, for the installer's progress bar. The keys are the web
 * app's PIPELINE_STEPS (apps/web/lib/dossier-jobs.ts), in that order. Progress is cosmetic: a
 * failed write is logged and never fails the job, and a job no longer RUNNING is left alone.
 */
async function reportProgress(jobId: string, step: string): Promise<void> {
  try {
    await db.dossierJob.updateMany({ where: { id: jobId, status: 'RUNNING' }, data: { progressStep: step, progressAt: new Date() } });
  } catch (error) {
    console.warn(`processJob: job ${jobId}: progress "${step}" not recorded.`, error);
  }
}

/** File.mimeType as stored (short form since upload validation; full MIME in older rows). */
const ANNEX_MIME_TYPES: Record<string, AnnexFile['mimeType']> = {
  pdf: 'pdf',
  'application/pdf': 'pdf',
  png: 'png',
  'image/png': 'png',
  jpeg: 'jpeg',
  jpg: 'jpeg',
  'image/jpeg': 'jpeg',
  webp: 'webp',
  'image/webp': 'webp',
};

/** How an annex document is named in the job warnings. */
function earthingRow(earthing: WorkerJobSnapshot['earthing']): EarthingRow | null {
  if (!earthing) return null;
  const { rodCount, rodLengthM, mainEarthSectionMm2, frameEarthSectionMm2, earthToPitSectionMm2, targetResistanceOhm } = earthing;
  return { rodCount, rodLengthM, mainEarthSectionMm2, frameEarthSectionMm2, earthToPitSectionMm2, targetResistanceOhm };
}

function annexLabel(document: AnnexDocument): string {
  return `Annexe N°${ANNEX_NUMBERS[document.slot]} — ${document.label}`;
}

/** The documents' pages, in order, as one PDF. */
async function concatPdfs(pdfs: Buffer[]): Promise<Buffer> {
  const target = await PDFDocument.create();
  for (const pdf of pdfs) {
    const source = await PDFDocument.load(pdf);
    for (const page of await target.copyPages(source, source.getPageIndices())) target.addPage(page);
  }
  return Buffer.from(await target.save());
}

/** Pages `indices` of `pdf` as a standalone PDF. */
async function extractPages(pdf: Buffer, indices: number[]): Promise<Buffer> {
  const source = await PDFDocument.load(pdf);
  const target = await PDFDocument.create();
  for (const page of await target.copyPages(source, indices)) {
    target.addPage(page);
  }
  return Buffer.from(await target.save());
}

interface LoadedAnnexes {
  files: Map<AnnexDocument, AnnexFile>;
  warnings: string[];
}

/**
 * Reads every annex document's bytes. A catalog file whose bytes are missing from this server's
 * storage (e.g. a catalog imported elsewhere and not yet copied over) must not sink the whole
 * dossier: it is left out with a job warning. A missing project upload (agreement, CIN, bill,
 * contract, attestation…) still fails the job.
 */
async function loadAnnexFiles(documents: AnnexDocument[], projectFileIds: Set<string>): Promise<LoadedAnnexes> {
  const files = new Map<AnnexDocument, AnnexFile>();
  const warnings: string[] = [];
  const fileIds = [...new Set(documents.flatMap((d) => (d.source.kind === 'file' ? [d.source.fileId] : [])))];
  const rows = fileIds.length > 0 ? await db.file.findMany({ where: { id: { in: fileIds } } }) : [];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const { getFilePath } = await import('@dossipv/file-storage');

  for (const document of documents) {
    const label = annexLabel(document);
    if (document.source.kind === 'fragment') {
      files.set(document, { buffer: document.source.buffer, mimeType: 'pdf', label });
      continue;
    }
    const { fileId } = document.source;
    const row = rowsById.get(fileId);
    if (!row) {
      if (projectFileIds.has(fileId)) throw new Error(`Annex file ${fileId} not found`);
      warnings.push(`${label} : fichier introuvable, non joint au dossier.`);
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = await readFile(getFilePath(row.storageKey));
    } catch (error) {
      if (!projectFileIds.has(fileId) && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`loadAnnexFiles: equipment file ${fileId} (${row.storageKey}) is missing on disk; skipped.`);
        warnings.push(`${label} : fichier introuvable, non joint au dossier.`);
        continue;
      }
      throw error;
    }
    const mimeType = ANNEX_MIME_TYPES[row.mimeType] ?? 'pdf';
    if (document.slot === 'ADMIN' && mimeType === 'pdf') {
      // A page printed from a browser often ends on an empty page; an unreadable PDF stays as it is.
      try {
        buffer = await dropBlankTrailingPages(buffer);
      } catch (error) {
        console.warn(`loadAnnexFiles: ${label} could not be cleaned of blank trailing pages.`, error);
      }
    }
    files.set(document, { buffer, mimeType, label });
  }
  return { files, warnings };
}

/**
 * Replaces the module and inverter datasheets in `files` with copies whose used values are
 * highlighted, as the reference dossier does. A datasheet that cannot be highlighted (a scan
 * without text, a model printed nowhere, an image file, an unreadable PDF) stays as it is and
 * the job records a warning; it never fails the job.
 */
async function highlightDatasheets(files: Map<AnnexDocument, AnnexFile>, snapshot: WorkerJobSnapshot): Promise<string[]> {
  const module = snapshot.arrayConfig?.module;
  const inverters = (snapshot.arrayConfig?.inverters ?? []).map(({ inverter }) => inverter);
  const warnings: string[] = [];
  for (const [document, file] of files) {
    if (document.source.kind !== 'file') continue;
    const { fileId } = document.source;
    const isModule = document.slot === 'MODULE' && module?.datasheetFileId === fileId;
    const inverter = document.slot === 'INVERTER' ? inverters.find((i) => i.datasheetFileId === fileId) : undefined;
    if (!isModule && !inverter) continue;
    try {
      let result = { pdf: file.buffer, highlighted: false };
      if (file.mimeType === 'pdf' && isModule) {
        const { pmaxW, vocV, iscA, vmpV, impA } = snapshot.engineInput.module;
        result = await highlightModuleDatasheet(file.buffer, { model: module.model, pmaxW, vocV, iscA, vmpV, impA });
      } else if (file.mimeType === 'pdf' && inverter) {
        result = await highlightInverterDatasheet(file.buffer, inverter.model);
      }
      if (result.highlighted) {
        files.set(document, { ...file, buffer: result.pdf });
        continue;
      }
    } catch (error) {
      console.warn(`processJob: ${file.label} could not be highlighted.`, error);
    }
    warnings.push(`Surlignage impossible dans ${file.label} (document scanné ou modèle introuvable).`);
  }
  return warnings;
}

/** A model to find in one of the official lists, and where its page goes. */
interface ListPageRequest {
  kind: 'STEG_INVERTER_LIST' | 'ANME_PANEL_LIST';
  model: string;
}

const LIST_PAGE_ANNEXES = {
  STEG_INVERTER_LIST: { slot: 'INVERTER_HOMOLOGATION', name: 'STEG', label: 'Liste STEG des onduleurs acceptés' },
  ANME_PANEL_LIST: { slot: 'MODULE', name: 'ANME', label: 'Liste ANME des panneaux acceptés' },
} as const;

/**
 * The page of the stored STEG / ANME list that names each requested model, its row highlighted,
 * as an annex fragment. A list that is not stored, unreadable, or does not name the model never
 * fails the job: nothing is appended and the job records a warning.
 */
async function loadListPageAnnexes(requests: ListPageRequest[]): Promise<{ documents: AnnexDocument[]; warnings: string[] }> {
  const documents: AnnexDocument[] = [];
  const warnings: string[] = [];
  const lists = new Map<ListPageRequest['kind'], Promise<Buffer | null>>();
  const loadList = async (kind: ListPageRequest['kind']): Promise<Buffer | null> => {
    const stored = await db.catalogSourceDocument.findUnique({ where: { kind }, include: { file: true } });
    if (!stored) return null;
    const { getFilePath } = await import('@dossipv/file-storage');
    return readFile(getFilePath(stored.file.storageKey));
  };

  for (const { kind, model } of requests) {
    const annex = LIST_PAGE_ANNEXES[kind];
    try {
      if (!lists.has(kind)) lists.set(kind, loadList(kind));
      const list = await lists.get(kind)!;
      const found = list ? await buildListPageAnnex(list, model) : null;
      if (found) {
        documents.push({ slot: annex.slot, label: `${annex.label} — page ${found.pageNumber}`, source: { kind: 'fragment', buffer: found.page } });
        continue;
      }
    } catch (error) {
      console.warn(`processJob: the ${annex.name} list page for ${model} could not be built.`, error);
    }
    warnings.push(`Page de la liste ${annex.name} introuvable pour ${model}.`);
  }
  return { documents, warnings };
}

/**
 * PVGIS inputs for the frozen snapshot: the installation point when the installer placed one,
 * else the site GPS; the engine's own DC and AC voltage drops. Throws when the site or its tilt
 * is missing, since the dossier cannot carry a simulation without them.
 */
function buildSimulationInput(snapshot: WorkerJobSnapshot): ProductionSimulationInput {
  const site = snapshot.site;
  if (!site) {
    throw new Error('The snapshot has no located site: PVGIS needs a GPS point.');
  }
  if (site.tiltDeg === null) {
    throw new Error('The snapshot site has no tilt: PVGIS needs one.');
  }
  const point =
    site.installationPointLat !== null && site.installationPointLon !== null
      ? { lat: site.installationPointLat, lon: site.installationPointLon }
      : { lat: site.gpsLat, lon: site.gpsLon };
  const { array, module } = snapshot.engineInput;
  const { derived } = runEngine(snapshot.engineInput);
  return {
    ...point,
    tiltDeg: site.tiltDeg,
    azimuthDeg: site.azimuthDeg ?? 0,
    module,
    moduleCount: array.reduce((sum, entry) => sum + entry.mppts.reduce((s, m) => s + m.stringsInParallel * m.modulesPerString, 0), 0),
    inverterPacW: array.reduce((sum, entry) => sum + entry.inverter.pacW, 0),
    dcVoltageDropPct: derived.DU_DC_PCT ?? 0,
    acVoltageDropPct: derived.DU_AC_PCT ?? 0,
  };
}

export async function processJob(jobId: string): Promise<void> {
  await reportProgress(jobId, 'snapshot');
  const job = await db.dossierJob.findUniqueOrThrow({ where: { id: jobId } });

  const snapshot = parseJobSnapshot(job.inputSnapshot);
  if (!snapshot) {
    return fail(jobId, 'snapshot', new Error('inputSnapshot failed parseJobSnapshot validation'));
  }

  const company = await db.company.findUnique({ where: { id: snapshot.companyId } });
  if (!company) {
    return fail(jobId, 'docx', new Error(`Company ${snapshot.companyId} not found`));
  }
  // The action refuses to queue a job without the agreement, but the company is read live: one
  // removed after queueing must still stop the job, before PVGIS or any paid Claude call.
  if (!company.anmeCertificateFileId) {
    return fail(jobId, 'annexes', new Error(`Company ${snapshot.companyId} has no ANME agreement`), ANME_AGREEMENT_MISSING_REASON);
  }

  const installer = installerIdentityFromCompany(company);
  const warnings: string[] = [];

  // PVGIS is mandatory (user, 2026-10-22) and runs first, so an outage fails the job before any
  // paid Claude call or rendering work. The PVGIS client already retries a 429 / 5xx once and
  // never a 403 (its maintenance page), so only network failures are retried here.
  let production: ProductionSimulation;
  let simulationInput: ProductionSimulationInput;
  await reportProgress(jobId, 'simulation');
  try {
    simulationInput = buildSimulationInput(snapshot);
    const input = simulationInput;
    production = await withRetry(() => simulateProduction(input), { isRetryable: (error) => !(error instanceof PvgisFetchError) && isRetryableError(error) });
  } catch (error) {
    return fail(jobId, 'simulation', error);
  }

  let workerResult;
  await reportProgress(jobId, 'text');
  try {
    workerResult = await withRetry(() =>
      generateDossierDocument({ engineInput: snapshot.engineInput, projectMeta: snapshot.projectMeta }, anthropicClient),
    );
  } catch (error) {
    return fail(jobId, 'text', error);
  }

  let docxBuffer: Buffer;
  await reportProgress(jobId, 'docx');
  try {
    const templateData = buildTemplateData({
      workerResult,
      engineInput: snapshot.engineInput,
      projectMeta: snapshot.projectMeta,
      snapshot: {
        client: snapshot.client,
        cableRuns: snapshot.cableRuns,
        earthing: earthingRow(snapshot.earthing),
        inverterBrandModels: (snapshot.arrayConfig?.inverters ?? []).map((inv) => `${inv.inverter.brand} ${inv.inverter.model}`),
        acSpdInKA: typeof snapshot.protections?.acSpd?.inKA === 'number' ? snapshot.protections.acSpd.inKA : null,
        azimuthDeg: snapshot.site?.azimuthDeg ?? null,
        hasStructureAttestation: typeof snapshot.structure?.structureAttestationFileId === 'string',
      },
      installer,
      equipmentTables: buildEquipmentTables({
        snapshot,
        engineInput: snapshot.engineInput,
        engineResult: workerResult.engineResult,
        hasStructureAttestation: typeof snapshot.structure?.structureAttestationFileId === 'string',
      }),
      dossierNumber: snapshot.dossierNumber,
      dossierDate: snapshot.engineInput.dossierDate,
      production,
      consumption: snapshot.consumption,
      subscribedPowerKVA: snapshot.client?.subscribedPowerKVA ?? null,
      phases: snapshot.engineInput.site.phases,
      draftMissing: snapshot.draftMissing,
    });
    const templateBuffer = await readFile(TEMPLATE_PATH);
    docxBuffer = fillDossierTemplate(templateBuffer, templateData);
  } catch (error) {
    return fail(jobId, 'docx', error);
  }

  // Fragment assembly. Final page order: cover → TOC → body → annex divider + bordereau → the
  // annexes in ANNEX_PHYSICAL_ORDER (the drawings and plans are annexes N°4-6).
  // Each fragment's page count is read inside the step that produced it, so an unreadable
  // fragment fails at the step responsible for it rather than at the TOC.
  let bodyPdfBuffer: Buffer;
  let bodyPageCount: number;
  await reportProgress(jobId, 'pdf');
  try {
    bodyPdfBuffer = await convertDocxToPdf(docxBuffer);
    bodyPageCount = (await PDFDocument.load(bodyPdfBuffer)).getPageCount();
  } catch (error) {
    return fail(jobId, 'pdf', error);
  }

  // The cover, drawings, PVGIS report and site plans.
  await reportProgress(jobId, 'drawings');
  let companyLogoBuffer: Buffer | null = null;
  if (company.logoFileId) {
    try {
      const logoFile = await db.file.findUnique({ where: { id: company.logoFileId } });
      if (logoFile) {
        const { getFilePath } = await import('@dossipv/file-storage');
        companyLogoBuffer = await readFile(getFilePath(logoFile.storageKey));
      }
    } catch {
      // A missing/corrupt logo file must never fail the whole dossier — the cover and site-plan
      // pages already render gracefully without one (embedLogo/embedImageSafely both no-op on null).
      companyLogoBuffer = null;
    }
  }

  // The official STEG logo is a static asset the product owner supplies; until it is there the
  // cover simply has no STEG logo and the job says so — it never fails the dossier.
  let stegLogoBuffer: Buffer | null = null;
  try {
    stegLogoBuffer = await tryLoadStegLogo();
  } catch (error) {
    console.warn(`processJob: job ${jobId}: the STEG logo could not be read.`, error);
  }
  if (!stegLogoBuffer) warnings.push(STEG_LOGO_MISSING_WARNING);

  let coverPageBuffer: Buffer;
  try {
    coverPageBuffer = await renderCoverPage({
      installer,
      companyLogoBuffer,
      stegLogoBuffer,
      dossierNumber: snapshot.dossierNumber,
      client: {
        fullName: snapshot.client?.fullName ?? '',
        cin: snapshot.client?.cin ?? null,
        address: snapshot.client?.address ?? null,
        stegReference: snapshot.client?.stegReference ?? null,
      },
      // The point PVGIS simulated: the installation point when placed, else the site GPS.
      gps: { lat: production.lat, lon: production.lon },
      installedKWp: production.installedKWp,
      // engineInput.dossierDate is the persisted date the engine's own checks (C20/C22) ran
      // against — using it here keeps the cover consistent with what was actually validated,
      // rather than a fresh "today" that could differ from a regenerated dossier's original run.
      dossierDate: snapshot.engineInput.dossierDate,
    });
  } catch (error) {
    return fail(jobId, 'cover', error);
  }

  // Annexes N°4 and N°7-9: the single-line diagram and the panel, DC box and AC box wiring diagrams.
  let drawingBuffers: { singleLine: Buffer; panelWiring: Buffer; dcBox: Buffer; acBox: Buffer };
  let drawingCartouche: DrawingCartouche | null = null;
  try {
    const inputs = buildDrawingInputs({
      snapshot,
      engineResult: workerResult.engineResult,
      installer,
      installedKWp: production.installedKWp,
      stegLogoBuffer,
    });
    drawingCartouche = inputs.singleLine.cartouche;
    drawingBuffers = {
      singleLine: await renderSingleLineDiagram(inputs.singleLine),
      panelWiring: await renderPanelWiringDiagram(inputs.panelWiring),
      dcBox: await renderDcBoxDiagram(inputs.dcBox),
      acBox: await renderAcBoxDiagram(inputs.acBox),
    };
    for (const buffer of Object.values(drawingBuffers)) await PDFDocument.load(buffer); // an unreadable drawing fails here, at its own step
  } catch (error) {
    return fail(jobId, 'drawings', error);
  }

  // Annex N°2: the PVGIS simulation report.
  let simulationReportBuffer: Buffer;
  try {
    const inverterLabels = [...new Set((snapshot.arrayConfig?.inverters ?? []).map(({ inverter }) => `${inverter.brand} ${inverter.model}`.trim()))];
    const { module } = snapshot.engineInput;
    simulationReportBuffer = await renderProductionReport(production, {
      moduleRef: snapshot.projectMeta.moduleBrandModel,
      moduleCount: simulationInput.moduleCount,
      inverterRef: inverterLabels.length > 0 ? inverterLabels.join(' + ') : snapshot.projectMeta.inverterBrandModel,
      inverterPacW: simulationInput.inverterPacW,
      dcDropPct: simulationInput.dcVoltageDropPct,
      acDropPct: simulationInput.acVoltageDropPct,
      dossierNumber: snapshot.dossierNumber,
      dossierDate: snapshot.engineInput.dossierDate,
      installerName: company.name,
      logo: companyLogoBuffer,
      stegLogo: stegLogoBuffer,
      // An older snapshot may lack the coefficient: the method block then describes it in words.
      moduleSpecs: Number.isFinite(module.pmaxW) && Number.isFinite(module.tempCoeffPmaxPct) ? { pmaxW: module.pmaxW, tempCoeffPmaxPct: module.tempCoeffPmaxPct, noctC: module.noctC ?? null } : undefined,
    });
    await PDFDocument.load(simulationReportBuffer); // an unreadable report fails here, at its own step
  } catch (error) {
    return fail(jobId, 'simulation-report', error);
  }

  // Annexes N°5-6, every tier: satellite imagery with the installer's points, cable legs and
  // lengths. A failed tile fetch only drops the photo; Premium adds the AI-reasoned layout.
  let sitePlanData: SitePlanData | null = null;
  let roof3dInput: Omit<Roof3dInput, 'cartouche'> | null = null;
  const site = snapshot.site;
  if (site) {
    const geoPoint = (lat: number | null, lon: number | null): LatLon | null => (lat !== null && lon !== null ? { lat, lon } : null);
    const sitePoint: LatLon = { lat: site.gpsLat, lon: site.gpsLon };
    const gps: SitePlanData['page37']['gps'] = {
      field: geoPoint(site.installationPointLat, site.installationPointLon) ?? sitePoint,
      technicalRoom: geoPoint(site.technicalRoomPointLat, site.technicalRoomPointLon),
      meter: geoPoint(site.meterPointLat, site.meterPointLon),
      earthPit: geoPoint(site.earthPitPointLat, site.earthPitPointLon),
    };
    const field = gps.field!;
    const placedPoints = [gps.technicalRoom, gps.meter, gps.earthPit].filter((p): p is LatLon => p !== null);
    // The installer's roof contour: page 37 frames all of it, and draws it.
    const roofOutline = site.roofOutline;
    const framed = [field, ...placedPoints, ...(roofOutline ?? [])];

    // Page 37 covers every point at the best zoom; page 38 is a neighbourhood-scale view centred
    // on the site. Both have exact pixel bounds, so every GPS point is projected to the image
    // pixel it really falls on.
    // The installer's own photo, with the points placed again on it, replaces the provider's on
    // page 37 (and so in the 3D view): its points and roof are drawn where the installer put them.
    const installerPhoto = await loadInstallerPhoto(jobId, site, gps, warnings);
    let provider = activeImageryProvider();
    let implantationView = installerPhoto?.view ?? planImplantationView(framed, implantationViewOptions(provider));
    let situationView = planSituationView(sitePoint);
    let page37Image: { standard: Buffer; print: Buffer } | null;
    let page38Image: { standard: Buffer; print: Buffer } | null;
    try {
      page37Image = installerPhoto?.images ?? (await fetchPlanImage(jobId, implantationView, 'implantation'));
      page38Image = await fetchPlanImage(jobId, situationView, 'situation');
    } catch (error) {
      if (!(error instanceof MapboxAuthError)) throw error;
      // Mapbox refused the token: say so on the job and redo the plans on Esri (re-planned, since
      // Esri has no imagery past zoom 18).
      console.warn(`processJob: job ${jobId}: Mapbox refused the access token (HTTP ${error.status}); falling back to Esri.`);
      warnings.push(MAPBOX_REFUSED_WARNING);
      provider = 'esri';
      if (!installerPhoto) implantationView = planImplantationView(framed, implantationViewOptions(provider));
      situationView = planSituationView(sitePoint);
      page37Image = installerPhoto?.images ?? (await fetchPlanImage(jobId, implantationView, 'implantation', provider));
      page38Image = await fetchPlanImage(jobId, situationView, 'situation', provider);
    }
    if (!page37Image) warnings.push(missingImageryWarning("d'implantation"));
    if (!page38Image) warnings.push(missingImageryWarning('de situation'));

    const providerCredit = provider === 'mapbox' ? { provider } : {}; // Esri is the default credit
    const page37Credit = installerPhoto ? { provider: 'installer' as const } : providerCredit;
    const toPixels = (p: LatLon | null): PixelPoint | null => (p ? projectToImage(implantationView, p) : null);
    const pixelPoints: SitePlanPoints = installerPhoto?.points ?? {
      field: toPixels(field),
      technicalRoom: toPixels(gps.technicalRoom),
      meter: toPixels(gps.meter),
      earthPit: toPixels(gps.earthPit),
    };
    const implantationMetersPerPixel = metersPerPixel(implantationView, field.lat);
    const roofPixels = installerPhoto ? installerPhoto.roofOutline : roofOutline ? roofOutline.map((corner) => projectToImage(implantationView, corner)) : null;

    // The array both vision calls place and the 3D view draws: a compact grid of rows.
    const moduleSpec = {
      moduleCount: snapshot.engineInput.array.reduce((sum, entry) => sum + entry.mppts.reduce((s, m) => s + m.stringsInParallel * m.modulesPerString, 0), 0),
      moduleLengthM: (snapshot.engineInput.module.lengthMm ?? 2000) / 1000,
      moduleWidthM: (snapshot.engineInput.module.widthMm ?? 1000) / 1000,
      tiltDeg: site.tiltDeg ?? snapshot.engineInput.structure.tiltDeg,
      latitudeDeg: field.lat,
    };
    const azimuthDeg = site.azimuthDeg ?? 0;
    const array = { moduleCount: moduleSpec.moduleCount, ...compactArrayFootprint(moduleSpec) };

    // The vision call needs a photo and at least one placed point to route the wiring to.
    let layout: Page37Layout | null = null;
    if (snapshot.tier === 'PREMIUM' && placedPoints.length > 0 && page37Image) {
      const aiPoints: Page37Points = { technicalRoom: pixelPoints.technicalRoom, meter: pixelPoints.meter, earthPit: pixelPoints.earthPit };
      try {
        layout = await withRetry(
          () =>
            generatePage37Layout(
              {
                satelliteImage: page37Image.standard,
                imageWidthPx: implantationView.widthPx,
                imageHeightPx: implantationView.heightPx,
                metersPerPixel: implantationMetersPerPixel,
                sitePoint: projectToImage(implantationView, field),
                points: aiPoints,
                array,
                azimuthDeg,
                tiltDeg: moduleSpec.tiltDeg,
                roofOutline: roofPixels,
              },
              anthropicClient,
            ),
          // Spec §5: a layout failing validation (incl. out-of-bounds coordinates) is retried
          // like a network error, and only then fails the job — never drawn.
          { isRetryable: (error) => isRetryableError(error) || isRetryablePage37LayoutError(error) },
        );
      } catch (error) {
        return fail(jobId, 'page-37-layout', error);
      }
    }

    // Without an AI rectangle, Claude still picks where the array stands on a drawn roof (3D view,
    // so only for a dossier with one: spec 2026-10-23 §2.1). Indicative only: any failure keeps the
    // 3D view's own placement and never fails the dossier.
    let placement: RoofPlacement | null = null;
    if (snapshot.with3d && !layout && roofPixels && page37Image) {
      try {
        placement = await withRetry(
          () =>
            generateRoofPlacement(
              {
                satelliteImage: page37Image.standard,
                imageWidthPx: implantationView.widthPx,
                imageHeightPx: implantationView.heightPx,
                metersPerPixel: implantationMetersPerPixel,
                roofOutline: roofPixels,
                field: pixelPoints.field!,
                array,
                azimuthDeg,
                tiltDeg: moduleSpec.tiltDeg,
              },
              anthropicClient,
            ),
          { isRetryable: (error) => isRetryableError(error) || isRetryableRoofPlacementError(error) },
        );
      } catch (error) {
        console.warn(`processJob: job ${jobId}: no roof placement from Claude; the 3D view centres the array on the roof.`, error);
      }
    }

    const { dcRun, acRun } = snapshot.engineInput;
    const dcFormula = gps.technicalRoom ? formatRunLengthFormula(groundDistanceM(field, gps.technicalRoom), dcRun.lengthM, site.floors, 'DC') : null;
    const acFormula = gps.technicalRoom && gps.meter ? formatRunLengthFormula(groundDistanceM(gps.technicalRoom, gps.meter), acRun.lengthM, site.floors, 'AC') : null;
    // The 3D view is drawn on page 37's own photo, so the AI panel rectangle needs no conversion.
    if (snapshot.with3d && page37Image) {
      roof3dInput = {
        image: { buffer: page37Image.print, widthPx: implantationView.widthPx, heightPx: implantationView.heightPx, metersPerPixel: implantationMetersPerPixel },
        field: pixelPoints.field!,
        technicalRoom: pixelPoints.technicalRoom,
        meter: pixelPoints.meter,
        earthPit: pixelPoints.earthPit,
        footprint: layout?.panelRectangle ?? null,
        roofOutline: roofPixels,
        roofAreaM2: roofOutline ? polygonAreaM2(roofOutline) : null,
        placement,
        imageCredit: IMAGERY_ATTRIBUTION[page37Credit.provider ?? 'esri'],
        ...moduleSpec,
        moduleLabel: snapshot.projectMeta.moduleBrandModel,
        azimuthDeg,
        installedKWp: production.installedKWp,
      };
    }
    sitePlanData = {
      page37: {
        image: { buffer: page37Image?.print ?? null, widthPx: implantationView.widthPx, heightPx: implantationView.heightPx, metersPerPixel: implantationMetersPerPixel, ...page37Credit },
        layout,
        roofOutline: roofPixels,
        roofAreaM2: roofOutline ? polygonAreaM2(roofOutline) : null,
        points: pixelPoints,
        gps,
        dc: { lengthM: dcRun.lengthM, sectionMm2: dcRun.sectionMm2, formula: dcFormula },
        ac: { lengthM: acRun.lengthM, sectionMm2: acRun.sectionMm2, formula: acFormula },
      },
      page38: {
        image: { buffer: page38Image?.print ?? null, widthPx: situationView.widthPx, heightPx: situationView.heightPx, metersPerPixel: metersPerPixel(situationView, sitePoint.lat), ...providerCredit },
        sitePin: projectToImage(situationView, sitePoint),
      },
    };
  }

  // The renderer draws the implantation plan then the situation plan; each is its own annex.
  let implantationPlanBuffer: Buffer;
  let situationPlanBuffer: Buffer | null;
  try {
    const sitePlanBuffer = await renderSitePlanPages({
      clientFullName: snapshot.client?.fullName ?? '',
      clientAddress: snapshot.client?.address ?? '',
      gps: snapshot.site ? { lat: snapshot.site.gpsLat, lon: snapshot.site.gpsLon } : { lat: 0, lon: 0 },
      installerName: company.name,
      installerAnmeCode: company.anmeCode,
      installerContact: { address: company.address, phone: company.phone, email: company.email },
      companyLogoBuffer,
      dossierDate: snapshot.engineInput.dossierDate,
      dossierNumber: snapshot.dossierNumber,
      planData: sitePlanData,
    });
    const sitePlanPageCount = (await PDFDocument.load(sitePlanBuffer)).getPageCount();
    implantationPlanBuffer = sitePlanPageCount >= 2 ? await extractPages(sitePlanBuffer, [0]) : sitePlanBuffer;
    situationPlanBuffer = sitePlanPageCount >= 2 ? await extractPages(sitePlanBuffer, Array.from({ length: sitePlanPageCount - 1 }, (_, i) => i + 1)) : null;
  } catch (error) {
    return fail(jobId, 'map-pages', error);
  }

  // Annex N°5, second sheet: the 3D view of the array on the roof, for a dossier with 3D (Premium).
  // Never fails the dossier.
  if (roof3dInput && drawingCartouche) {
    try {
      const roof3d = await renderRoof3dView({ ...roof3dInput, cartouche: drawingCartouche });
      implantationPlanBuffer = await concatPdfs([implantationPlanBuffer, roof3d]);
    } catch (error) {
      console.warn(`processJob: job ${jobId}: the 3D roof view could not be drawn.`, error);
      warnings.push(ROOF_3D_MISSING_WARNING);
    }
  } else if (sitePlanData && snapshot.with3d) {
    warnings.push(ROOF_3D_MISSING_WARNING);
  }

  // The TOC, the annexes and the assembly of both PDFs.
  await reportProgress(jobId, 'annexes');
  const dcFuseRequired = snapshot.engineInput.dcFuse !== null;
  const acIsolatorRequired = snapshot.engineInput.acIsolator !== null;

  // 1 = cover, 2 = TOC. A draft gets its missing-pieces page right after the cover (inserted by
  // applyDraftWatermark at the end), so every page number printed in the TOC and the bordereau of
  // dossier.pdf moves by that page. annexes.pdf is never watermarked and keeps its own numbering.
  const draftPageOffset = snapshot.draftMissing.length > 0 ? DRAFT_INSERTED_PAGE_COUNT : 0;
  const BODY_START_PAGE = STUDY_PAGE_COUNT_BEFORE_BODY + 1 + draftPageOffset;
  let tocBuffer: Buffer;
  try {
    // Built from the SAME computeSectionNumbers() the body template itself uses (via
    // buildTemplateData, below) — never a second, separately hardcoded set of roman numerals —
    // and each heading's page is read from the body PDF itself.
    const sectionNumbers = computeSectionNumbers(dcFuseRequired, acIsolatorRequired);
    const bodyTitles = [
      `${sectionNumbers.sectionNumberPreambule} Préambule`,
      `${sectionNumbers.sectionNumberPresentation} Présentation du projet`,
      `${sectionNumbers.sectionNumberDimensionnement} Dimensionnement et productible`,
      `${sectionNumbers.sectionNumberSolution} Description de la solution technique`,
      `${sectionNumbers.sectionNumberProtections} Dimensionnement des protections`,
      `${sectionNumbers.sectionNumberCablage} Câblage`,
      `${sectionNumbers.sectionNumberTerre} Mise à la terre`,
      `${sectionNumbers.sectionNumberStructure} Structure et lestage`,
      ...(dcFuseRequired ? [`${sectionNumbers.sectionNumberFusible} Protection DC — fusible`] : []),
      ...(acIsolatorRequired ? [`${sectionNumbers.sectionNumberSectionneur} Protection AC — sectionneur`] : []),
      `${sectionNumbers.sectionNumberCompliance} Vérifications réglementaires`,
      `${sectionNumbers.sectionNumberConclusion} Conclusion`,
    ];
    // At most 11 body entries + « Annexes »: well within one TOC page (renderTableOfContents fits
    // 32 rows per page), so the one-page TOC assumed by STUDY_PAGE_COUNT_BEFORE_BODY still holds.
    const bodyPages = await findHeadingPages(bodyPdfBuffer, bodyTitles);
    let previousPage = 1;
    const tocEntries: TocEntry[] = bodyTitles.map((title, index) => {
      const bodyPage = bodyPages[index];
      if (bodyPage === null || bodyPage === undefined) warnings.push(`Sommaire : titre « ${title} » introuvable.`);
      previousPage = bodyPage ?? previousPage;
      return { title, pageNumber: BODY_START_PAGE + previousPage - 1 };
    });
    // The divider (« ANNEXES » + bordereau) follows the body; the drawings and plans are annexes.
    tocEntries.push({ title: 'Annexes', pageNumber: BODY_START_PAGE + bodyPageCount });
    tocBuffer = await renderTableOfContents(tocEntries);
  } catch (error) {
    return fail(jobId, 'toc', error);
  }

  // The annex plan: every annex numbered like the reference, the bordereau's page numbers from
  // each document's real page count, documents appended in the reference's physical order.
  const dividerStartPage = BODY_START_PAGE + bodyPageCount;
  let annexFiles: AnnexFile[];
  let dividerBuffer: Buffer;
  let annexesOnlyDividerBuffer: Buffer;
  try {
    const project = await db.project.findUnique({
      where: { id: snapshot.projectId },
      include: { annexes: { include: { extraFiles: true } }, structure: { select: { structureAttestationFileId: true } } },
    });
    const annexes = project?.annexes ?? null;
    const fileDocuments = annexDocumentsFromSnapshot(
      snapshot,
      { anmeCertificateFileId: company.anmeCertificateFileId },
      annexes
        ? {
            cinFileId: annexes.cinFileId,
            commercialRegisterFileId: annexes.commercialRegisterFileId,
            stegContractFileId: annexes.stegContractFileId,
            lastPaidBillFileId: annexes.lastPaidBillFileId,
            moduleAcceptanceFileId: annexes.moduleAcceptanceFileId ?? null,
            syndicAuthorizationFileId: annexes.syndicAuthorizationFileId ?? null,
            extraFileIds: annexes.extraFiles.map((f) => f.fileId),
          }
        : null,
      project?.structure?.structureAttestationFileId ?? null,
    );
    const fragmentDocuments: AnnexDocument[] = [
      { slot: 'SIMULATION', label: 'Rapport de simulation de production PVGIS', source: { kind: 'fragment', buffer: simulationReportBuffer } },
      { slot: 'SINGLE_LINE', label: 'Schéma unifilaire', source: { kind: 'fragment', buffer: drawingBuffers.singleLine } },
      { slot: 'PANEL_WIRING', label: 'Câblage des panneaux', source: { kind: 'fragment', buffer: drawingBuffers.panelWiring } },
      { slot: 'DC_BOX', label: 'Câblage du coffret DC', source: { kind: 'fragment', buffer: drawingBuffers.dcBox } },
      { slot: 'AC_BOX', label: 'Câblage du coffret AC', source: { kind: 'fragment', buffer: drawingBuffers.acBox } },
      { slot: 'IMPLANTATION', label: "Plan d'implantation et de connexion", source: { kind: 'fragment', buffer: implantationPlanBuffer } },
      ...(situationPlanBuffer ? [{ slot: 'SITUATION', label: 'Plan de situation', source: { kind: 'fragment', buffer: situationPlanBuffer } } satisfies AnnexDocument] : []),
    ];
    // Annex N°10 is the STEG list page naming the inverter; the ANME list page stands in for the
    // module's acceptance letter (annex N°11) only when there is no such letter.
    const module = snapshot.arrayConfig?.module;
    const moduleAcceptanceFileId = annexes?.moduleAcceptanceFileId ?? module?.homologationFileId ?? null;
    const listPages = await loadListPageAnnexes([
      ...[...new Set((snapshot.arrayConfig?.inverters ?? []).map(({ inverter }) => inverter.model))].map((model) => ({ kind: 'STEG_INVERTER_LIST' as const, model })),
      ...(module && !moduleAcceptanceFileId ? [{ kind: 'ANME_PANEL_LIST' as const, model: module.model }] : []),
    ]);
    warnings.push(...listPages.warnings);
    const plan = buildAnnexPlan([...fragmentDocuments, ...fileDocuments, ...listPages.documents]);
    const ordered = physicalAnnexDocuments(plan);

    // Uploads are required (a missing one fails the job); catalog files are optional.
    const projectFileIds = new Set(
      [
        company.anmeCertificateFileId,
        annexes?.cinFileId,
        annexes?.commercialRegisterFileId,
        annexes?.stegContractFileId,
        annexes?.lastPaidBillFileId,
        annexes?.moduleAcceptanceFileId,
        annexes?.syndicAuthorizationFileId,
        ...(annexes?.extraFiles.map((f) => f.fileId) ?? []),
        project?.structure?.structureAttestationFileId,
      ].filter((id): id is string => typeof id === 'string'),
    );
    const loaded = await loadAnnexFiles(ordered, projectFileIds);
    warnings.push(...loaded.warnings);
    warnings.push(...(await highlightDatasheets(loaded.files, snapshot)));
    annexFiles = ordered.flatMap((document) => {
      const file = loaded.files.get(document);
      return file ? [file] : [];
    });
    const pageCounts = new Map<AnnexDocument, number | null>();
    for (const document of ordered) {
      const file = loaded.files.get(document);
      pageCounts.set(document, file ? await annexPageCount(file) : null);
    }

    const dividerEntries = (firstAnnexPage: number): AnnexDividerEntry[] => {
      const starts = annexStartPages(plan, pageCounts, firstAnnexPage);
      return plan.map((entry: AnnexEntry) => ({
        number: entry.number,
        title: entry.title,
        pageNumber: starts.get(entry.slot) ?? null,
        // An annex that has documents, none of them readable, is not « sans objet ».
        ...(entry.documents.length > 0 ? { note: 'document non joint' } : {}),
      }));
    };
    // The divider's own length is fixed by the number of rows, never by the page numbers in them.
    const dividerPageCount = (await PDFDocument.load(await renderAnnexDivider(dividerEntries(0)))).getPageCount();
    dividerBuffer = await renderAnnexDivider(dividerEntries(dividerStartPage + dividerPageCount));
    // annexes.pdf opens on its own divider, so its bordereau counts from its own page 1.
    annexesOnlyDividerBuffer = await renderAnnexDivider(dividerEntries(1 + dividerPageCount));
  } catch (error) {
    return fail(jobId, 'annexes', error);
  }

  // dossier.pdf is the full document WITH the annexes merged in; annexes.pdf is the divider and
  // the annexes alone.
  let pdfBuffer: Buffer;
  try {
    const merged = await mergeDocumentFragments([coverPageBuffer, tocBuffer, bodyPdfBuffer, dividerBuffer], annexFiles);
    pdfBuffer = merged.pdf;
    warnings.push(...merged.skipped.map((label) => `${label} : document illisible, non joint au dossier.`));
  } catch (error) {
    return fail(jobId, 'assembly', error);
  }

  let annexesPdfBuffer: Buffer;
  try {
    annexesPdfBuffer = (await mergeDocumentFragments([annexesOnlyDividerBuffer], annexFiles)).pdf;
  } catch (error) {
    return fail(jobId, 'annexes', error);
  }

  // The study pages (cover, TOC, body) get the reference's frame, running header and « Page n
  // sur N » footer; the annexes keep their own pages. This runs before the draft watermark, so
  // the footers shift by the page it will insert after the cover, like the TOC's numbers.
  try {
    pdfBuffer = await stampStudyPages(pdfBuffer, {
      studyPageCount: STUDY_PAGE_COUNT_BEFORE_BODY + bodyPageCount,
      logo: companyLogoBuffer,
      stegLogo: stegLogoBuffer,
      installerName: company.name,
      dossierNumber: snapshot.dossierNumber,
      pagesInsertedAfterCover: draftPageOffset,
    });
  } catch (error) {
    return fail(jobId, 'assembly', error);
  }

  // A dossier queued with STEG pieces missing is a draft: dossier.pdf says so on every page and
  // lists what is missing after the cover. annexes.pdf holds only the annexes and stays as it is.
  if (snapshot.draftMissing.length > 0) {
    try {
      pdfBuffer = await applyDraftWatermark(pdfBuffer, snapshot.draftMissing);
    } catch (error) {
      return fail(jobId, 'assembly', error);
    }
  }

  await reportProgress(jobId, 'save');
  try {
    const docxSaved = await saveFile(docxBuffer, 'dossier.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const docxFile = await db.file.create({ data: { fileName: 'dossier.docx', mimeType: 'docx', storageKey: docxSaved.storageKey } });

    const pdfSaved = await saveFile(pdfBuffer, 'dossier.pdf', 'application/pdf');
    const pdfFile = await db.file.create({ data: { fileName: 'dossier.pdf', mimeType: 'pdf', storageKey: pdfSaved.storageKey } });

    const annexesSaved = await saveFile(annexesPdfBuffer, 'annexes.pdf', 'application/pdf');
    const annexesFile = await db.file.create({ data: { fileName: 'annexes.pdf', mimeType: 'pdf', storageKey: annexesSaved.storageKey } });

    const simulationFigures = {
      source: 'PVGIS_LIVE',
      annualProductionKWh: production.annualProductionKWh,
      specificYieldKWhPerKWp: production.specificYieldKWhPerKWp,
      performanceRatioPct: production.performanceRatioPct,
      systemLossesPct: null,
      pvsystReportFileId: null,
    };
    await db.projectSimulation.upsert({
      where: { projectId: snapshot.projectId },
      create: { projectId: snapshot.projectId, ...simulationFigures },
      update: simulationFigures,
    });

    await db.dossierCheckResult.createMany({
      data: workerResult.engineResult.checks.map((check) => ({
        jobId,
        checkId: check.id,
        level: check.level,
        pass: check.pass,
        message: check.message,
      })),
    });

    await db.dossierJob.update({
      where: { id: jobId },
      data: {
        status: 'SUCCEEDED',
        completedAt: new Date(),
        docxFileId: docxFile.id,
        pdfFileId: pdfFile.id,
        annexesPdfFileId: annexesFile.id,
        warnings,
      },
    });
  } catch (error) {
    return fail(jobId, 'save', error);
  }
}
