import { createHash } from 'crypto';
import { access, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { DATA_DIR } from './sources';

export async function download(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}) : ${url}`);
  await writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
}

/** Datasheets are cached under data/catalog/.cache (*.pdf is gitignored). */
export async function cachedDatasheet(url: string): Promise<string> {
  const path = join(DATA_DIR, '.cache', `${createHash('sha1').update(url).digest('hex')}.pdf`);
  try {
    await access(path);
  } catch {
    await mkdir(join(DATA_DIR, '.cache'), { recursive: true });
    await download(url, path);
  }
  return path;
}
