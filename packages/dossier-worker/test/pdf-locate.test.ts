import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { extractTextBoxes, findModel, normalizeModel, type TextBox } from '../src/pdf-locate';
import { syntheticListPdf, TARGET_MODEL, TARGET_ROW_Y } from './helpers/synthetic-list';

describe('pdf-locate', () => {
  it('extracts text boxes in page coordinates', async () => {
    const pages = await extractTextBoxes(await syntheticListPdf());
    expect(pages).toHaveLength(3);
    const target = pages[1]!.find((box) => box.text === TARGET_MODEL);
    expect(target).toBeDefined();
    expect(target!.x).toBeCloseTo(160, 1);
    expect(target!.y).toBeCloseTo(TARGET_ROW_Y, 1);
    expect(target!.height).toBeCloseTo(10, 1);
    expect(target!.width).toBeGreaterThan(80);
    expect(pages[0]!.some((box) => box.text === TARGET_MODEL)).toBe(false);
  });

  it('gives the coordinates of a rotated page as it is displayed', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 600]);
    page.setRotation(degrees(90));
    // Drawn rotated so that it reads horizontally once the page is shown in landscape.
    page.drawText('ROTATED', { x: 100, y: 50, size: 10, font, rotate: degrees(90) });
    const [boxes] = await extractTextBoxes(Buffer.from(await doc.save()));
    const box = boxes!.find((b) => b.text === 'ROTATED')!;
    // Displayed page is 600 × 400 (y up); /Rotate 90 shows user (u, v) at (v, 400 − u).
    expect(box.x).toBeCloseTo(50, 1);
    expect(box.y).toBeCloseTo(300, 1);
    expect(box.height).toBeCloseTo(10, 1);
  });

  it('normalizes model strings', () => {
    expect(normalizeModel('SUN-2.2K-G04P1-EU-AM1')).toBe(normalizeModel('SUN 2.2K G04P1 EU AM1'));
    expect(normalizeModel('ae450mc_144/x')).toBe('AE450MC144X');
  });

  it('matches a model split across two text items', async () => {
    const boxes: TextBox[] = [
      { text: 'DEYE', x: 60, y: 600, width: 30, height: 10 },
      { text: 'SUN-2.2K-', x: 160, y: 600, width: 50, height: 10 },
      { text: 'G04P1-EU-AM1', x: 210, y: 600.5, width: 70, height: 10 },
      { text: '2 200 W', x: 360, y: 600, width: 40, height: 10 },
    ];
    expect(findModel(boxes, TARGET_MODEL).map((b) => b.text)).toEqual(['SUN-2.2K-', 'G04P1-EU-AM1']);

    const pages = await extractTextBoxes(await syntheticListPdf({ splitTarget: true }));
    expect(pages[1]!.some((box) => box.text === TARGET_MODEL)).toBe(false); // really two items
    const hits = findModel(pages[1]!, TARGET_MODEL);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((hit) => Math.abs(hit.y - TARGET_ROW_Y) < 1)).toBe(true);
  });

  it('does not join items from another line or a distant column', () => {
    const boxes: TextBox[] = [
      { text: 'SUN-2.2K-', x: 160, y: 600, width: 50, height: 10 },
      { text: 'G04P1-EU-AM1', x: 210, y: 575, width: 70, height: 10 },
      { text: 'G04P1-EU-AM1', x: 400, y: 600, width: 70, height: 10 },
    ];
    expect(findModel(boxes, TARGET_MODEL)).toEqual([]);
  });

  it('returns [] when the model is absent', () => {
    expect(findModel([{ text: 'SUN-3K-G04P1', x: 0, y: 0, width: 10, height: 10 }], TARGET_MODEL)).toEqual([]);
    expect(findModel([], TARGET_MODEL)).toEqual([]);
  });
});
