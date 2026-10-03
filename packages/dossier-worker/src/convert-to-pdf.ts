import { execFile } from 'child_process';
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const CONVERSION_TIMEOUT_MS = 60_000;

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'dossipv-pdf-'));
  const inputPath = join(dir, 'input.docx');
  const outputPath = join(dir, 'input.pdf');

  try {
    await writeFile(inputPath, docxBuffer);
    await execFileAsync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, inputPath], {
      timeout: CONVERSION_TIMEOUT_MS,
    });
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
