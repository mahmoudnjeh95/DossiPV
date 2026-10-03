import { readFile } from 'fs/promises';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@dossipv/db';
import { saveFile } from '@dossipv/file-storage';
import { fillDossierTemplate } from '@dossipv/docx-template';
import { generateDossierDocument, DossierGenerationBlockedError } from './generate-dossier-document';
import { buildTemplateData } from './build-template-data';
import { convertDocxToPdf } from './convert-to-pdf';
import { mergeAnnexes, type AnnexFile } from './merge-annexes';
import { parseJobSnapshot } from './job-snapshot';
import { withRetry } from './retry';

const TEMPLATE_PATH = join(import.meta.dirname, '..', '..', 'docx-template', 'template', 'dossier-template.docx');

// Reads ANTHROPIC_API_KEY from the environment automatically (the SDK's own default
// behavior) — no new env var convention needed for this worker specifically.
const anthropicClient = new Anthropic();

async function fail(jobId: string, failedStep: string, failureReason: string): Promise<void> {
  await db.dossierJob.update({
    where: { id: jobId },
    data: { status: 'FAILED', failedStep, failureReason, completedAt: new Date() },
  });
}

async function collectAnnexFiles(projectId: string, companyId: string): Promise<AnnexFile[]> {
  const [company, project] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.project.findUnique({ where: { id: projectId }, include: { annexes: { include: { extraFiles: true } } } }),
  ]);

  const fileIds = [
    company?.anmeCertificateFileId,
    project?.annexes?.cinFileId,
    project?.annexes?.commercialRegisterFileId,
    project?.annexes?.stegContractFileId,
    project?.annexes?.lastPaidBillFileId,
    ...(project?.annexes?.extraFiles.map((f) => f.fileId) ?? []),
  ].filter((id): id is string => typeof id === 'string');

  if (fileIds.length === 0) {
    return [];
  }

  const files = await db.file.findMany({ where: { id: { in: fileIds } } });
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
    return fail(jobId, 'snapshot', 'Instantané de la saisie illisible ou corrompu.');
  }

  let workerResult;
  try {
    workerResult = await withRetry(() =>
      generateDossierDocument({ engineInput: snapshot.engineInput, projectMeta: snapshot.projectMeta }, anthropicClient),
    );
  } catch (error) {
    if (error instanceof DossierGenerationBlockedError) {
      return fail(jobId, 'text', error.message);
    }
    return fail(jobId, 'text', error instanceof Error ? error.message : String(error));
  }

  const company = await db.company.findUnique({ where: { id: snapshot.companyId } });
  if (!company) {
    return fail(jobId, 'docx', 'Société introuvable.');
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
    return fail(jobId, 'docx', error instanceof Error ? error.message : String(error));
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await convertDocxToPdf(docxBuffer);
  } catch (error) {
    return fail(jobId, 'pdf', error instanceof Error ? error.message : String(error));
  }

  let annexesPdfBuffer: Buffer;
  try {
    const annexFiles = await collectAnnexFiles(snapshot.projectId, snapshot.companyId);
    annexesPdfBuffer = await mergeAnnexes(pdfBuffer, annexFiles);
  } catch (error) {
    return fail(jobId, 'annexes', error instanceof Error ? error.message : String(error));
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
    return fail(jobId, 'save', error instanceof Error ? error.message : String(error));
  }
}
