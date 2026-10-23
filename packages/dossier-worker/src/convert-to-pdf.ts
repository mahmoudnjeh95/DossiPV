import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
// A cold LibreOffice start on the dev machine already takes ~40 s for a full dossier body.
const CONVERSION_TIMEOUT_MS = 120_000;

/** The portable LibreOffice of the Windows dev machine, which is not on its PATH. */
const PORTABLE_SOFFICE = join(homedir(), 'LibreOfficeX', 'program', process.platform === 'win32' ? 'soffice.exe' : 'soffice');

/**
 * The LibreOffice executable: SOFFICE_PATH when set, else the portable copy when present, else
 * `soffice` from the PATH (the real server). Resolved per call, so the worker never depends on
 * how its shell was started.
 */
export function sofficeCommand(): string {
  const configured = (process.env.SOFFICE_PATH ?? '').trim();
  if (configured) return configured;
  return existsSync(PORTABLE_SOFFICE) ? PORTABLE_SOFFICE : 'soffice';
}

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'dossipv-pdf-'));
  const inputPath = join(dir, 'input.docx');
  const outputPath = join(dir, 'input.pdf');

  try {
    await writeFile(inputPath, docxBuffer);
    await execFileAsync(sofficeCommand(), ['--headless', '--convert-to', 'pdf', '--outdir', dir, inputPath], {
      timeout: CONVERSION_TIMEOUT_MS,
    });
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
