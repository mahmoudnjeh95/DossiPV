import { cookies } from 'next/headers';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { db } from '@dossipv/db';
import { validateSession } from '@dossipv/auth';
import { getFilePath } from '@dossipv/file-storage';
import { attachmentDisposition, dossierDownloadName } from '../../../../../../../../lib/dossier-files';

const FILE_ID_FIELDS = { docx: 'docxFileId', pdf: 'pdfFileId', annexes: 'annexesPdfFileId' } as const;
const CONTENT_TYPES: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

/** A plain French message instead of an empty body, which a browser shows as a generic English error. */
function errorResponse(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

const NOT_FOUND_MESSAGE = "Ce fichier est introuvable. Retournez à la page du dossier et relancez la génération si besoin.";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; jobId: string; kind: string }> },
): Promise<Response> {
  const { id: projectId, jobId, kind } = await params;

  const token = (await cookies()).get('dossipv_session')?.value;
  const user = token ? await validateSession(token) : null;
  if (!user) {
    return errorResponse(401, 'Session expirée. Reconnectez-vous pour télécharger ce fichier.');
  }

  const project = await db.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    select: { id: true, client: { select: { fullName: true } } },
  });
  if (!project) {
    return errorResponse(404, NOT_FOUND_MESSAGE);
  }

  if (!(kind in FILE_ID_FIELDS)) {
    return errorResponse(404, NOT_FOUND_MESSAGE);
  }
  const fileIdField = FILE_ID_FIELDS[kind as keyof typeof FILE_ID_FIELDS];

  const job = await db.dossierJob.findFirst({ where: { id: jobId, projectId } });
  if (!job) {
    return errorResponse(404, NOT_FOUND_MESSAGE);
  }
  const fileId = (job as unknown as Record<string, string | null>)[fileIdField];
  if (!fileId) {
    return errorResponse(404, NOT_FOUND_MESSAGE);
  }

  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) {
    return errorResponse(404, NOT_FOUND_MESSAGE);
  }

  const filePath = getFilePath(file.storageKey);
  try {
    await stat(filePath);
  } catch {
    // Row recorded but the bytes are gone (storage root changed, volume not mounted): say so rather than crash mid-stream.
    return errorResponse(404, 'Le fichier généré est introuvable sur le serveur (stockage indisponible). Relancez la génération du dossier.');
  }
  const stream = createReadStream(filePath);
  const contentType = CONTENT_TYPES[file.mimeType] ?? 'application/octet-stream';
  // Saved under the client's name and the generation day, not the stored `dossier.pdf`.
  const downloadName = dossierDownloadName(kind as keyof typeof FILE_ID_FIELDS, project.client?.fullName, job.completedAt ?? job.startedAt);

  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': attachmentDisposition(downloadName),
    },
  });
}
