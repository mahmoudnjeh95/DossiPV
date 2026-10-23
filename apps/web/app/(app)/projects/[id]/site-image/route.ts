import { cookies } from 'next/headers';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { db } from '@dossipv/db';
import { validateSession } from '@dossipv/auth';
import { getFilePath } from '@dossipv/file-storage';

/** The project's imported satellite photo, for the Emplacements map; only its own company may read it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: projectId } = await params;

  const token = (await cookies()).get('dossipv_session')?.value;
  const user = token ? await validateSession(token) : null;
  if (!user) {
    return new Response(null, { status: 401 });
  }

  const project = await db.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    select: { site: { select: { siteImage: { select: { storageKey: true } } } } },
  });
  const storageKey = project?.site?.siteImage?.storageKey;
  if (!storageKey) {
    return new Response(null, { status: 404 });
  }

  return new Response(Readable.toWeb(createReadStream(getFilePath(storageKey))) as unknown as ReadableStream, {
    status: 200,
    // The URL carries the file id: a new photo gets a new URL, so this one never changes.
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}
