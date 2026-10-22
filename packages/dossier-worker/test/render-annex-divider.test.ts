import { describe, it, expect } from 'vitest';
import { renderAnnexDivider } from '../src/render-annex-divider';
import { ANNEX_TITLES, buildAnnexPlan } from '../src/annex-plan';
import { extractPdfContent, findText, pageText } from './helpers/pdf-content';

function entries(): { number: number; title: string; pageNumber: number | null }[] {
  return buildAnnexPlan([]).map((entry) => ({
    number: entry.number,
    title: entry.title,
    pageNumber: entry.slot === 'RCD' ? 57 : entry.slot === 'ADMIN' ? 12 : null,
  }));
}

describe('renderAnnexDivider', () => {
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
