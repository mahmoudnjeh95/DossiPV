import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** xpdf 4.x pdftotext (`-table` does not exist in poppler's build). */
export async function pdfToText(pdfPath: string, mode: 'table' | 'layout'): Promise<string> {
  const binary = process.env.PDFTOTEXT_PATH ?? 'pdftotext';
  const { stdout } = await execFileAsync(binary, [`-${mode}`, '-enc', 'UTF-8', pdfPath, '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}
