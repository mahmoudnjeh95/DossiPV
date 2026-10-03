import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let testRoot: string;

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), 'dossipv-file-storage-test-'));
  process.env.FILE_STORAGE_ROOT = testRoot;
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.FILE_STORAGE_ROOT;
});

describe('saveFile / getFilePath / deleteFile', () => {
  it('saves a file under the configured root and returns a storageKey that is a relative path', async () => {
    const { saveFile } = await import('../src/index');
    const content = Buffer.from('fake pdf content');

    const { storageKey } = await saveFile(content, 'datasheet.pdf', 'application/pdf');

    expect(storageKey.startsWith('/')).toBe(false);
    expect(storageKey.includes('..')).toBe(false);

    const { getFilePath } = await import('../src/index');
    const fullPath = getFilePath(storageKey);
    expect(existsSync(fullPath)).toBe(true);
    expect(readFileSync(fullPath)).toEqual(content);
  });

  it('sanitizes the original file name so no path-traversal characters survive into storageKey', async () => {
    const { saveFile, getFilePath } = await import('../src/index');
    const { storageKey } = await saveFile(Buffer.from('x'), '../../etc/passwd.pdf', 'application/pdf');

    expect(storageKey.includes('..')).toBe(false);
    const fullPath = getFilePath(storageKey);
    expect(fullPath.startsWith(testRoot)).toBe(true);
  });

  it('deleteFile removes the file from disk', async () => {
    const { saveFile, getFilePath, deleteFile } = await import('../src/index');
    const { storageKey } = await saveFile(Buffer.from('to be deleted'), 'temp.pdf', 'application/pdf');
    const fullPath = getFilePath(storageKey);
    expect(existsSync(fullPath)).toBe(true);

    await deleteFile(storageKey);

    expect(existsSync(fullPath)).toBe(false);
  });

  it('deleteFile does not throw for a storageKey that does not exist on disk', async () => {
    const { deleteFile } = await import('../src/index');
    await expect(deleteFile('equipment/does-not-exist.pdf')).resolves.toBeUndefined();
  });
});
