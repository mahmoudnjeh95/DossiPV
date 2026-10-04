import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { toPdfSafeText, wrapPdfText, fitPdfText, isWinAnsiEncodable } from '../src/pdf-text';

// Invisible characters are spelled out by code point so they are visible in this file.
const cp = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const NBSP = cp(0xa0);
const NARROW_NBSP = cp(0x202f);
const THIN_SPACE = cp(0x2009);
const FIGURE_SPACE = cp(0x2007);
const COMBINING_ACUTE = cp(0x301);
const RLM = cp(0x200f);
const VARIATION_SELECTOR_16 = cp(0xfe0f);

let helvetica: PDFFont;
let helveticaBold: PDFFont;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  helvetica = await doc.embedFont(StandardFonts.Helvetica);
  helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
});

describe('toPdfSafeText', () => {
  it('keeps French text, including accents, ligature œ, guillemets, € and the regular no-break space, unchanged', () => {
    const french = `Élodie Bénard — « Câblage » : 12,5 € / œuvre à Sfax, çà et là… n° 3${NBSP}kWc`;
    expect(toPdfSafeText(french)).toBe(french);
  });

  it('transliterates Latin letters outside WinAnsi instead of throwing (ğ, Ł, ş, ő, ı)', () => {
    expect(toPdfSafeText('Doğan Łukasz Şahin Erdős Işık')).toBe('Dogan Lukasz Sahin Erdos Isik');
  });

  it('turns the narrow no-break space and other exotic spaces into plain spaces', () => {
    expect(toPdfSafeText(`3${NARROW_NBSP}100${THIN_SPACE}W${FIGURE_SPACE}x`)).toBe('3 100 W x');
  });

  it('expands the "ﬁ"/"ﬂ" ligatures copied out of PDFs', () => {
    expect(toPdfSafeText(`${cp(0xfb01)}che ${cp(0xfb02)}ux`)).toBe('fiche flux');
  });

  it('recomposes decomposed accents (e + U+0301) instead of losing them', () => {
    expect(toPdfSafeText(`Be${COMBINING_ACUTE}ja`)).toBe('Béja');
  });

  it('replaces Arabic script with "?" and drops the bidi control marks around it', () => {
    expect(toPdfSafeText(`${RLM}حبيب خذيرة${RLM}`)).toBe('???? ?????');
  });

  it('replaces emoji / astral characters with a single "?" each (no lone surrogates, variation selectors dropped)', () => {
    expect(toPdfSafeText(`Soleil ${cp(0x2600)}${VARIATION_SELECTOR_16} ${cp(0x1f600)}`)).toBe('Soleil ? ?');
  });

  it('flattens line breaks and tabs so a pasted multi-line address stays on one line', () => {
    expect(toPdfSafeText('12 rue X\r\nTunis\tTN')).toBe('12 rue X  Tunis TN');
  });

  it('produces text Helvetica can always encode, for every BMP code point and a sample of astral ones', () => {
    const failures: string[] = [];
    const codePoints: number[] = [];
    for (let c = 0; c <= 0xffff; c += 1) {
      if (c >= 0xd800 && c <= 0xdfff) continue; // surrogate halves are not characters
      codePoints.push(c);
    }
    codePoints.push(0x1f600, 0x1f468, 0x20000, 0x1d400, 0xe0101);
    for (const c of codePoints) {
      const safe = toPdfSafeText(String.fromCodePoint(c));
      try {
        helvetica.encodeText(safe);
        helveticaBold.encodeText(safe);
      } catch {
        failures.push(c.toString(16));
      }
    }
    expect(failures).toEqual([]);
  });

  it('isWinAnsiEncodable agrees with what pdf-lib can really encode for every character it accepts', () => {
    for (let c = 0; c <= 0x2122; c += 1) {
      if (!isWinAnsiEncodable(c)) continue;
      expect(() => helvetica.encodeText(String.fromCodePoint(c))).not.toThrow();
    }
  });
});

describe('wrapPdfText / fitPdfText', () => {
  it('wraps words so no line is wider than maxWidth, hard-breaking a single over-long word', () => {
    const lines = wrapPdfText(helvetica, 'Interrupteur-sectionneur DC ZJBENYBB1H63ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8, 60);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(helvetica.widthOfTextAtSize(line, 8)).toBeLessThanOrEqual(60);
    }
  });

  it('never throws on unencodable input while measuring', () => {
    expect(() => wrapPdfText(helvetica, `Onduleur حبيب ğ${NARROW_NBSP}${cp(0xfb01)}`, 8, 50)).not.toThrow();
  });

  it('shrinks the font until the text fits the box height, and truncates with an ellipsis as a last resort', () => {
    const fitted = fitPdfText(helvetica, 'Parafoudre AC Generic AC-SPD-1 Type 2', { size: 9, minSize: 5, maxWidth: 70, maxHeight: 30 });
    expect(fitted.lines.length * fitted.lineHeight).toBeLessThanOrEqual(30);
    for (const line of fitted.lines) {
      expect(helvetica.widthOfTextAtSize(line, fitted.size)).toBeLessThanOrEqual(70);
    }

    // At minSize 5 with 1.2 line spacing a line is 6pt tall, so a 7pt-tall box holds exactly one.
    const truncated = fitPdfText(helvetica, 'word '.repeat(200), { size: 9, minSize: 5, maxWidth: 40, maxHeight: 7 });
    expect(truncated.lines).toHaveLength(1);
    expect(truncated.lines[0]!.endsWith('…')).toBe(true);
  });
});
