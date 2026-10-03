import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import PizZip from 'pizzip';
import { convertDocxToPdf } from '../src/convert-to-pdf';

function sofficeAvailable(): boolean {
  try {
    execFileSync('soffice', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const describeIfSoffice = sofficeAvailable() ? describe : describe.skip;

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
  });

  it('rejects when the input is not a valid docx', async () => {
    const garbage = Buffer.from('this is not a docx file at all');

    await expect(convertDocxToPdf(garbage)).rejects.toThrow();
  });
});

if (!sofficeAvailable()) {
  console.warn('convert-to-pdf.test.ts: soffice not found on PATH, skipping (the real server has it installed).');
}
