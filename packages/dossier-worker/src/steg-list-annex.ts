import { PDFDocument } from 'pdf-lib';
import { drawHighlights, rowRect } from './highlight';
import { extractTextBoxes, findModel, type TextBox } from './pdf-locate';

/** Groups hits by baseline, so a model listed twice on one page gets one band per row. */
function groupByRow(hits: TextBox[]): TextBox[][] {
  const rows: TextBox[][] = [];
  for (const hit of hits) {
    const row = rows.find((r) => Math.abs(r[0]!.y - hit.y) <= 2);
    if (row) row.push(hit);
    else rows.push([hit]);
  }
  return rows;
}

/**
 * The page of an official accepted-equipment list (STEG inverters, ANME panels) that lists
 * `model`, alone, with that model's row highlighted. `pageNumber` is 1-based in the list. Null
 * when no page lists the model.
 */
export async function buildListPageAnnex(listPdf: Buffer, model: string): Promise<{ page: Buffer; pageNumber: number } | null> {
  const pages = await extractTextBoxes(listPdf);
  for (const [index, boxes] of pages.entries()) {
    const hits = findModel(boxes, model);
    if (hits.length === 0) continue;

    const source = await PDFDocument.load(listPdf);
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(source, [index]);
    single.addPage(copied);
    const page = await drawHighlights(Buffer.from(await single.save()), 0, groupByRow(hits).map((row) => rowRect(boxes, row)));
    return { page, pageNumber: index + 1 };
  }
  return null;
}
