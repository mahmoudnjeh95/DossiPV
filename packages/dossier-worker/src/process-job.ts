import { readFile } from 'fs/promises';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import { db } from '@dossipv/db';
import { saveFile } from '@dossipv/file-storage';
import { fillDossierTemplate } from '@dossipv/docx-template';
import { generateDossierDocument } from './generate-dossier-document';
import { buildTemplateData } from './build-template-data';
import { convertDocxToPdf } from './convert-to-pdf';
import { mergeDocumentFragments, type AnnexFile } from './merge-annexes';
import { parseJobSnapshot, type WorkerJobSnapshot } from './job-snapshot';
import { withRetry, isRetryableError } from './retry';
import { renderCoverPage } from './render-cover-page';
import { renderDrawingPages } from './render-drawings';
import { generatePage37Layout, isRetryablePage37LayoutError, type Page37Layout, type Page37Points } from './generate-page-37-layout';
import {
  fetchSatelliteImage,
  metersPerPixel,
  planImplantationView,
  planSituationView,
  projectToImage,
  type LatLon,
  type PixelPoint,
} from './fetch-satellite-image';
import { renderSitePlanPages, type SitePlanPremiumData } from './render-site-plan-pages';
import { renderTableOfContents } from './render-toc';

const TEMPLATE_PATH = join(import.meta.dirname, '..', '..', 'docx-template', 'template', 'dossier-template.docx');

// Reads ANTHROPIC_API_KEY from the environment automatically (the SDK's own default
// behavior) — no new env var convention needed for this worker specifically.
const anthropicClient = new Anthropic();

// Generic, step-specific French messages shown to the installer — never the raw error message,
// which can leak internals (file system paths, DB column/constraint names, SDK error bodies).
// The real error is logged server-side for operators via console.error in each catch block below.
const GENERIC_FAILURE_REASONS: Record<string, string> = {
  snapshot: 'Instantané de la saisie illisible ou corrompu.',
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

async function fail(jobId: string, failedStep: string, internalError: unknown): Promise<void> {
  // Operator-facing log of the real cause; DossierJob.failureReason itself only ever gets the
  // generic, installer-safe message below.
  console.error(`processJob: job ${jobId} failed at step "${failedStep}":`, internalError);
  await db.dossierJob.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      failedStep,
      failureReason: GENERIC_FAILURE_REASONS[failedStep] ?? 'La génération du dossier a échoué.',
      completedAt: new Date(),
    },
  });
}

async function collectAnnexFiles(projectId: string, companyId: string, snapshot: WorkerJobSnapshot): Promise<AnnexFile[]> {
  const [company, project] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.project.findUnique({ where: { id: projectId }, include: { annexes: { include: { extraFiles: true } } } }),
  ]);

  const equipmentFileIds: (string | null | undefined)[] = [];
  if (snapshot.arrayConfig) {
    equipmentFileIds.push(snapshot.arrayConfig.module.datasheetFileId, snapshot.arrayConfig.module.homologationFileId);
    for (const inv of snapshot.arrayConfig.inverters) {
      equipmentFileIds.push(inv.inverter.datasheetFileId, inv.inverter.homologationFileId);
    }
  }
  if (snapshot.protections) {
    for (const device of [snapshot.protections.dcSwitch, snapshot.protections.dcSpd, snapshot.protections.dcFuse, snapshot.protections.acBreaker, snapshot.protections.acSpd, snapshot.protections.acIsolator]) {
      if (device) equipmentFileIds.push(device.datasheetFileId, device.homologationFileId);
    }
  }
  if (snapshot.earthing?.earthCable) {
    equipmentFileIds.push(snapshot.earthing.earthCable.datasheetFileId, snapshot.earthing.earthCable.homologationFileId);
  }

  const fileIds = new Set([
    company?.anmeCertificateFileId,
    project?.annexes?.cinFileId,
    project?.annexes?.commercialRegisterFileId,
    project?.annexes?.stegContractFileId,
    project?.annexes?.lastPaidBillFileId,
    ...(project?.annexes?.extraFiles.map((f) => f.fileId) ?? []),
    ...equipmentFileIds,
  ].filter((id): id is string => typeof id === 'string'));

  if (fileIds.size === 0) {
    return [];
  }

  const files = await db.file.findMany({ where: { id: { in: [...fileIds] } } });
  const { getFilePath } = await import('@dossipv/file-storage');
  const annexFiles: AnnexFile[] = [];
  for (const file of files) {
    const buffer = await readFile(getFilePath(file.storageKey));
    annexFiles.push({ buffer, mimeType: file.mimeType as 'pdf' | 'png' | 'jpeg' });
  }
  return annexFiles;
}

export async function processJob(jobId: string): Promise<void> {
  const job = await db.dossierJob.findUniqueOrThrow({ where: { id: jobId } });

  const snapshot = parseJobSnapshot(job.inputSnapshot);
  if (!snapshot) {
    return fail(jobId, 'snapshot', new Error('inputSnapshot failed parseJobSnapshot validation'));
  }

  let workerResult;
  try {
    workerResult = await withRetry(() =>
      generateDossierDocument({ engineInput: snapshot.engineInput, projectMeta: snapshot.projectMeta }, anthropicClient),
    );
  } catch (error) {
    return fail(jobId, 'text', error);
  }

  const company = await db.company.findUnique({ where: { id: snapshot.companyId } });
  if (!company) {
    return fail(jobId, 'docx', new Error(`Company ${snapshot.companyId} not found`));
  }

  let docxBuffer: Buffer;
  try {
    const templateData = buildTemplateData({
      workerResult,
      engineInput: snapshot.engineInput,
      projectMeta: snapshot.projectMeta,
      snapshot: { client: snapshot.client, cableRuns: snapshot.cableRuns },
      companyInfo: { name: company.name, address: company.address, phone: company.phone, email: company.email },
    });
    const templateBuffer = await readFile(TEMPLATE_PATH);
    docxBuffer = fillDossierTemplate(templateBuffer, templateData);
  } catch (error) {
    return fail(jobId, 'docx', error);
  }

  // Fragment assembly. Final page order: cover → TOC → body → drawings (pages 35-36) → map pages
  // (37-38) → annexes. The TOC is rendered last because it needs the other fragments' real page
  // counts.
  // Each fragment's page count is read inside the step that produced it, so an unreadable
  // fragment fails at the step responsible for it rather than at the TOC.
  let bodyPdfBuffer: Buffer;
  let bodyPageCount: number;
  try {
    bodyPdfBuffer = await convertDocxToPdf(docxBuffer);
    bodyPageCount = (await PDFDocument.load(bodyPdfBuffer)).getPageCount();
  } catch (error) {
    return fail(jobId, 'pdf', error);
  }

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

  let coverPageBuffer: Buffer;
  try {
    coverPageBuffer = await renderCoverPage({
      companyName: company.name,
      companyLogoBuffer,
      dossierNumber: snapshot.dossierNumber,
      clientFullName: snapshot.client?.fullName ?? '',
      // engineInput.dossierDate is the persisted date the engine's own checks (C20/C22) ran
      // against — using it here keeps the cover consistent with what was actually validated,
      // rather than a fresh "today" that could differ from a regenerated dossier's original run.
      dossierDate: snapshot.engineInput.dossierDate,
    });
  } catch (error) {
    return fail(jobId, 'cover', error);
  }

  let drawingsBuffer: Buffer;
  let drawingsPageCount: number;
  try {
    const protections = snapshot.protections;
    const equipmentLabel = (device: { brand: string; model: string } | null | undefined): string =>
      device ? `${device.brand} ${device.model}` : '—';
    drawingsBuffer = await renderDrawingPages({
      moduleLabel: snapshot.projectMeta.moduleBrandModel,
      inverters: snapshot.engineInput.array.map((entry, i) => ({
        inverterLabel: `${snapshot.projectMeta.inverterBrandModel} (${i + 1})`,
        pacW: entry.inverter.pacW,
        mppts: entry.mppts,
      })),
      dcSwitchLabel: equipmentLabel(protections?.dcSwitch),
      dcSpdLabel: equipmentLabel(protections?.dcSpd),
      acSpdLabel: equipmentLabel(protections?.acSpd),
      acBreakerLabel: equipmentLabel(protections?.acBreaker),
      dcRun: { sectionMm2: snapshot.engineInput.dcRun.sectionMm2, lengthM: snapshot.engineInput.dcRun.lengthM },
      acRun: { sectionMm2: snapshot.engineInput.acRun.sectionMm2, lengthM: snapshot.engineInput.acRun.lengthM },
      earthRodCount: snapshot.projectMeta.earthRodCount,
    });
    drawingsPageCount = (await PDFDocument.load(drawingsBuffer)).getPageCount();
  } catch (error) {
    return fail(jobId, 'drawings', error);
  }

  // Pages 37-38: a Premium project with a located site gets real satellite imagery plus the
  // AI-reasoned page-37 layout. Anything else (Standard tier, or a Premium project whose site
  // isn't located yet) gets the empty title-block frames, with zero network or API calls.
  let sitePlanPremiumData: SitePlanPremiumData | null = null;
  const premiumSite = snapshot.tier === 'PREMIUM' ? snapshot.site : null;
  if (premiumSite) {
    const geoPoint = (lat: number | null, lon: number | null): LatLon | null => (lat !== null && lon !== null ? { lat, lon } : null);
    const geoPoints = {
      technicalRoom: geoPoint(premiumSite.technicalRoomPointLat, premiumSite.technicalRoomPointLon),
      meter: geoPoint(premiumSite.meterPointLat, premiumSite.meterPointLon),
      earthPit: geoPoint(premiumSite.earthPitPointLat, premiumSite.earthPitPointLon),
    };
    const sitePoint: LatLon = { lat: premiumSite.gpsLat, lon: premiumSite.gpsLon };
    const placedPoints = [geoPoints.technicalRoom, geoPoints.meter, geoPoints.earthPit].filter((p): p is LatLon => p !== null);

    // Page 37 covers the site and every placed point at the best zoom; page 38 is a
    // neighbourhood-scale view centred on the site. Both have exact pixel bounds, so every GPS
    // point is projected to the image pixel it really falls on.
    const implantationView = planImplantationView([sitePoint, ...placedPoints]);
    const situationView = planSituationView(sitePoint);

    let page37Image: Buffer;
    let page38Image: Buffer;
    try {
      page37Image = await withRetry(() => fetchSatelliteImage(implantationView));
      page38Image = await withRetry(() => fetchSatelliteImage(situationView));
    } catch (error) {
      return fail(jobId, 'map-pages', error);
    }

    const toPixels = (p: LatLon | null): PixelPoint | null => (p ? projectToImage(implantationView, p) : null);
    const pixelPoints: Page37Points = {
      technicalRoom: toPixels(geoPoints.technicalRoom),
      meter: toPixels(geoPoints.meter),
      earthPit: toPixels(geoPoints.earthPit),
    };

    // With no point placed on the map there is nothing to route the wiring to: skip the vision
    // call and show the satellite photo without an overlay rather than fail the job.
    let layout: Page37Layout | null = null;
    if (placedPoints.length > 0) {
      const moduleCount = snapshot.engineInput.array.reduce((sum, entry) => sum + entry.mppts.reduce((s, m) => s + m.stringsInParallel * m.modulesPerString, 0), 0);
      const { lengthMm, widthMm } = snapshot.engineInput.module;
      const arrayAreaM2 = lengthMm && widthMm ? (moduleCount * lengthMm * widthMm) / 1e6 : null;
      try {
        layout = await withRetry(
          () =>
            generatePage37Layout(
              {
                satelliteImage: page37Image,
                imageWidthPx: implantationView.widthPx,
                imageHeightPx: implantationView.heightPx,
                metersPerPixel: metersPerPixel(implantationView, sitePoint.lat),
                sitePoint: projectToImage(implantationView, sitePoint),
                points: pixelPoints,
                arrayAreaM2,
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

    sitePlanPremiumData = {
      page37: { image: { buffer: page37Image, widthPx: implantationView.widthPx, heightPx: implantationView.heightPx }, layout, points: pixelPoints },
      page38: { image: { buffer: page38Image, widthPx: situationView.widthPx, heightPx: situationView.heightPx }, sitePin: projectToImage(situationView, sitePoint) },
    };
  }

  let sitePlanBuffer: Buffer;
  try {
    sitePlanBuffer = await renderSitePlanPages({
      tier: sitePlanPremiumData ? 'PREMIUM' : 'STANDARD',
      clientFullName: snapshot.client?.fullName ?? '',
      clientAddress: snapshot.client?.address ?? '',
      gps: snapshot.site ? { lat: snapshot.site.gpsLat, lon: snapshot.site.gpsLon } : { lat: 0, lon: 0 },
      installerName: company.name,
      installerContact: { address: company.address, phone: company.phone, email: company.email },
      companyLogoBuffer,
      dossierDate: snapshot.engineInput.dossierDate,
      dossierNumber: snapshot.dossierNumber,
      premiumData: sitePlanPremiumData,
    });
  } catch (error) {
    return fail(jobId, 'map-pages', error);
  }

  let tocBuffer: Buffer;
  try {
    // Page numbers assume the cover and the TOC take one page each (7 entries always fit on one
    // TOC page). The fragment-level numbers (where the drawings and the map pages start) are
    // exact, from the real page counts above. The in-body sub-section numbers are deliberately
    // approximate fixed offsets: finding the page each prose section lands on inside the
    // LibreOffice-rendered body would mean parsing the body PDF's text layout, which is out of
    // scope for v1's TOC.
    tocBuffer = await renderTableOfContents([
      { title: 'I. Préambule', pageNumber: 3 },
      { title: 'II. Présentation du projet', pageNumber: 3 },
      { title: 'III. Description de la solution technique', pageNumber: 4 },
      { title: 'IV. Câblage', pageNumber: bodyPageCount - 2 > 4 ? bodyPageCount - 2 : 5 },
      { title: 'V. Mise à la terre', pageNumber: bodyPageCount },
      { title: 'Annexe — Schémas électriques', pageNumber: 3 + bodyPageCount },
      { title: 'Annexe — Plans de situation', pageNumber: 3 + bodyPageCount + drawingsPageCount },
    ]);
  } catch (error) {
    return fail(jobId, 'toc', error);
  }

  let annexFiles: AnnexFile[];
  try {
    annexFiles = await collectAnnexFiles(snapshot.projectId, snapshot.companyId, snapshot);
  } catch (error) {
    return fail(jobId, 'annexes', error);
  }

  // Master spec §5 step 8: dossier.pdf is the full document WITH the annexes merged in;
  // annexes.pdf is the annexes alone (a valid 0-page PDF when the project has none).
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await mergeDocumentFragments([coverPageBuffer, tocBuffer, bodyPdfBuffer, drawingsBuffer, sitePlanBuffer], annexFiles);
  } catch (error) {
    return fail(jobId, 'assembly', error);
  }

  let annexesPdfBuffer: Buffer;
  try {
    annexesPdfBuffer = await mergeDocumentFragments([], annexFiles);
  } catch (error) {
    return fail(jobId, 'annexes', error);
  }

  try {
    const docxSaved = await saveFile(docxBuffer, 'dossier.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const docxFile = await db.file.create({ data: { fileName: 'dossier.docx', mimeType: 'docx', storageKey: docxSaved.storageKey } });

    const pdfSaved = await saveFile(pdfBuffer, 'dossier.pdf', 'application/pdf');
    const pdfFile = await db.file.create({ data: { fileName: 'dossier.pdf', mimeType: 'pdf', storageKey: pdfSaved.storageKey } });

    const annexesSaved = await saveFile(annexesPdfBuffer, 'annexes.pdf', 'application/pdf');
    const annexesFile = await db.file.create({ data: { fileName: 'annexes.pdf', mimeType: 'pdf', storageKey: annexesSaved.storageKey } });

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
      },
    });
  } catch (error) {
    return fail(jobId, 'save', error);
  }
}
