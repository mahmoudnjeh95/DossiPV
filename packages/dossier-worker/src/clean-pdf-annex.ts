import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, type PDFPage } from 'pdf-lib';
import { extractTextBoxes } from './pdf-locate';

export { isBrowserPrintedBill } from './pdf-locate';

/** Text a browser leaves on an otherwise empty last page of a printed STEG page. */
const IGNORED_PAGE_TEXT = /^(\[Fermer la fenêtre\])?$/;

/** True when the page's resources hold an image XObject (a scan or a photo is not a blank page). */
function hasImage(page: PDFPage): boolean {
  // Resources may be inherited from a parent Pages node.
  let node: PDFDict | undefined = page.node;
  let xObjects: PDFDict | undefined;
  while (node && !xObjects) {
    xObjects = node.lookupMaybe(PDFName.of('Resources'), PDFDict)?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    node = node.lookupMaybe(PDFName.of('Parent'), PDFDict);
  }
  if (!xObjects) return false;
  for (const [, value] of xObjects.entries()) {
    const target = value instanceof PDFRef ? page.doc.context.lookup(value) : value;
    if (target instanceof PDFRawStream && target.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) return true;
  }
  return false;
}

/**
 * Removes the trailing pages of `pdf` that carry nothing: no image and no text, or only
 * `[Fermer la fenêtre]` (what a browser prints after a STEG page). At least one page is kept.
 * Returns the input unchanged when nothing is removed.
 */
export async function dropBlankTrailingPages(pdf: Buffer): Promise<Buffer> {
  const pagesText = await extractTextBoxes(pdf);
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  let keep = pages.length;
  while (keep > 1) {
    const text = (pagesText[keep - 1] ?? []).map((box) => box.text).join(' ').trim();
    if (!IGNORED_PAGE_TEXT.test(text) || hasImage(pages[keep - 1]!)) break;
    keep -= 1;
  }
  if (keep === pages.length) return pdf;
  for (let index = pages.length - 1; index >= keep; index -= 1) doc.removePage(index);
  return Buffer.from(await doc.save());
}
