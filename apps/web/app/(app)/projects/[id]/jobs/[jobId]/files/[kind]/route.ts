import { cookies } from 'next/headers';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { db } from '@dossipv/db';
import { validateSession } from '@dossipv/auth';
import { getFilePath } from '@dossipv/file-storage';

const FILE_ID_FIELDS = { docx: 'docxFileId', pdf: 'pdfFileId', annexes: 'annexesPdfFileId' } as const;
const CONTENT_TYPES: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; jobId: string; kind: string }> },
): Promise<Response> {
  const { id: projectId, jobId, kind } = await params;

  const token = (await cookies()).get('dossipv_session')?.value;
  const user = token ? await validateSession(token) : null;
  if (!user) {
    return new Response(null, { status: 401 });
  }

  const project = await db.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { id: true } });
  if (!project) {
    return new Response(null, { status: 404 });
  }

  if (!(kind in FILE_ID_FIELDS)) {
    return new Response(null, { status: 404 });
  }
  const fileIdField = FILE_ID_FIELDS[kind as keyof typeof FILE_ID_FIELDS];

  const job = await db.dossierJob.findFirst({ where: { id: jobId, projectId } });
  const fileId = job ? (job as unknown as Record<string, string | null>)[fileIdField] : null;
  if (!fileId) {
    return new Response(null, { status: 404 });
  }

  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) {
    return new Response(null, { status: 404 });
  }

  const stream = createReadStream(getFilePath(file.storageKey));
  const contentType = CONTENT_TYPES[file.mimeType] ?? 'application/octet-stream';

  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    },
  });
}
