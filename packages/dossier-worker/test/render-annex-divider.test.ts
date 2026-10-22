import { describe, it, expect } from 'vitest';
import { renderAnnexDivider } from '../src/render-annex-divider';
import { ANNEX_TITLES, buildAnnexPlan } from '../src/annex-plan';
import { extractPdfContent, findText, pageText, pdfFontNames, TIMES_FONTS } from './helpers/pdf-content';

function entries(): { number: number; title: string; pageNumber: number | null }[] {
  return buildAnnexPlan([]).map((entry) => ({
    number: entry.number,
    title: entry.title,
    pageNumber: entry.slot === 'RCD' ? 57 : entry.slot === 'ADMIN' ? 12 : null,
  }));
}

describe('renderAnnexDivider', () => {
  it('uses only the Times fonts (one font family across the dossier)', async () => {
    const fonts = await pdfFontNames(await renderAnnexDivider(entries()));
    expect(fonts.size).toBeGreaterThan(0);
    for (const font of fonts) expect(TIMES_FONTS).toContain(font);
  });

  it('draws a large ANNEXES page, then the bordereau with every annex number, title and page', async () => {
    const pages = await extractPdfContent(await renderAnnexDivider(entries()));

    expect(pages).toHaveLength(2);
    expect(findText(pages[0]!, 'ANNEXES')!.size).toBeGreaterThanOrEqual(40);

    const bordereau = pages[1]!;
    expect(findText(bordereau, 'Bordereau des annexes')).toBeDefined();
    for (const header of ['N°', 'Pièce', 'Page']) {
      expect(findText(bordereau, header)).toBeDefined();
    }
    const rcdNumber = findText(bordereau, /^18$/)!;
    const rcdTitle = findText(bordereau, 'Disjoncteur différentiel')!;
    const rcdPage = findText(bordereau, /^57$/)!;
    expect(rcdNumber).toBeDefined();
    expect(rcdTitle.text).toBe('Disjoncteur différentiel');
    // Same row: number, title and page share a baseline.
    expect(Math.abs(rcdNumber.y - rcdTitle.y)).toBeLessThan(1);
    expect(Math.abs(rcdPage.y - rcdTitle.y)).toBeLessThan(1);
    for (let n = 1; n <= 25; n += 1) {
      expect(findText(bordereau, new RegExp(`^${n}$`))).toBeDefined();
    }
  });

  it('shows an entry’s note instead of (sans objet) when its document could not be attached', async () => {
    const withNote = entries().map((entry) => (entry.number === 14 ? { ...entry, note: 'document non joint' } : entry));

    const bordereau = (await extractPdfContent(await renderAnnexDivider(withNote)))[1]!;

    const row = findText(bordereau, 'Parafoudre DC (document non joint)')!;
    expect(row).toBeDefined();
    expect(bordereau.texts.find((t) => t.text === '—' && Math.abs(t.y - row.y) < 1)).toBeDefined();
    expect(pageText(bordereau)).not.toContain('Parafoudre DC (sans objet)');
    // Every other empty annex keeps the default wording.
    expect(findText(bordereau, 'Fusible DC (sans objet)')).toBeDefined();
  });

  it('lists an empty annex as (sans objet) with a dash for its page', async () => {
    const pages = await extractPdfContent(await renderAnnexDivider(entries()));
    const bordereau = pages[1]!;

    const empty = findText(bordereau, `${ANNEX_TITLES.CABLE_TRAY} (sans objet)`)!;
    expect(empty).toBeDefined();
    const dash = bordereau.texts.find((t) => t.text === '—' && Math.abs(t.y - empty.y) < 1);
    expect(dash).toBeDefined();
    expect(pageText(bordereau)).toContain('(sans objet)');
    expect(pageText(bordereau)).not.toContain('Disjoncteur différentiel (sans objet)');
  });
});
