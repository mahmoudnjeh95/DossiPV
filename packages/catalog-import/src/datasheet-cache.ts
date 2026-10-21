import { writeFile } from 'fs/promises';

export async function download(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}) : ${url}`);
  await writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
}
