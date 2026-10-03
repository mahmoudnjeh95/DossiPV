import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { dirname, join, resolve } from 'path';

export * from './validate-upload';

function getRoot(): string {
  const root = process.env.FILE_STORAGE_ROOT;
  if (!root) {
    throw new Error('FILE_STORAGE_ROOT is not set.');
  }
  return root;
}

function sanitizeFileName(originalFileName: string): string {
  const baseName = originalFileName.split(/[/\\]/).pop() ?? 'file';
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function saveFile(buffer: Buffer, originalFileName: string, mimeType: string): Promise<{ storageKey: string }> {
  void mimeType; // part of the public interface for a future S3 implementation's ContentType — unused by local disk storage
  const sanitizedName = sanitizeFileName(originalFileName);
  const storageKey = `equipment/${randomUUID()}-${sanitizedName}`;
  const fullPath = join(getRoot(), storageKey);

  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);

  return { storageKey };
}

export function getFilePath(storageKey: string): string {
  return resolve(getRoot(), storageKey);
}

export async function deleteFile(storageKey: string): Promise<void> {
  try {
    await unlink(getFilePath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
