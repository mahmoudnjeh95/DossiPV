import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { isAbsolute, join } from 'path';
import PizZip from 'pizzip';
import { convertDocxToPdf, sofficeCommand } from '../src/convert-to-pdf';

function sofficeAvailable(): boolean {
  const command = sofficeCommand();
  // A resolved path is checked on disk: on Windows, soffice.exe --version never exits.
  if (isAbsolute(command)) return existsSync(command);
  try {
    execFileSync(command, ['--version'], { stdio: 'ignore', timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

const SOFFICE_AVAILABLE = sofficeAvailable();
const describeIfSoffice = SOFFICE_AVAILABLE ? describe : describe.skip;
// A real LibreOffice start takes tens of seconds; above CONVERSION_TIMEOUT_MS so its own error shows.
const CONVERSION_TEST_TIMEOUT_MS = 150_000;

// A minimal, real, valid .docx: a zip containing the three parts Word requires.
// Built inline with pizzip (already a dependency of @dossipv/docx-template; add it here too)
// rather than committing a binary fixture.
function buildMinimalDocx(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Conversion test</w:t></w:r></w:p></w:body></w:document>',
  );
  return zip.generate({ type: 'nodebuffer' });
}

describeIfSoffice('convertDocxToPdf', () => {
  it('converts a real minimal docx into a real PDF', async () => {
    const docx = buildMinimalDocx();

    const pdf = await convertDocxToPdf(docx);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(100);
  }, CONVERSION_TEST_TIMEOUT_MS);
});

// Not a garbage-input test: LibreOffice falls back to its plain-text import and still writes a PDF.
describe('convertDocxToPdf without LibreOffice', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects when soffice cannot be started', async () => {
    vi.stubEnv('SOFFICE_PATH', join(tmpdir(), 'no-libreoffice-here', 'soffice.exe'));

    await expect(convertDocxToPdf(buildMinimalDocx())).rejects.toThrow();
  });
});

if (!SOFFICE_AVAILABLE) {
  console.warn('convert-to-pdf.test.ts: soffice not found (SOFFICE_PATH, ~/LibreOfficeX or PATH), skipping (the real server has it installed).');
}
