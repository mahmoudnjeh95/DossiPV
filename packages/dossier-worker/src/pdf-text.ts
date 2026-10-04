import type { PDFFont, PDFPage, PDFPageDrawTextOptions } from 'pdf-lib';

/**
 * pdf-lib's StandardFonts (Helvetica, ...) can only encode WinAnsi (Windows-1252), and
 * `drawText`/`widthOfTextAtSize` THROW on anything else. Arabic-script names, "g-breve"/"L-stroke",
 * the narrow no-break space (U+202F) common in French text pasted from elsewhere, or the "fi"
 * ligature (U+FB01) copied out of a PDF would each fail a whole dossier job. Every string drawn
 * by this package's pdf-lib renderers therefore goes through `toPdfSafeText()` first (via
 * `drawPdfText()` / `wrapPdfText()` / `fitPdfText()`), so rendering can never crash on user data.
 *
 * Strategy: NFC-normalise, map known look-alikes (exotic spaces, dashes, Latin letters with no
 * Unicode decomposition), NFKD-decompose and strip diacritics for whatever is left (U+011F -> g,
 * U+FB01 -> fi), and replace anything still unencodable (Arabic, CJK, emoji) with "?". French
 * text (accents, oe ligature, guillemets, euro sign, ellipsis) is WinAnsi and passes unchanged.
 * Correct Arabic shaping/RTL would need an embedded Unicode font plus a shaping engine - out of
 * scope here; the body (docx -> LibreOffice) still shows the original Unicode text.
 *
 * Code points are written numerically on purpose: invisible characters (spaces, bidi marks,
 * variation selectors) must never appear literally in this source file.
 */

// WinAnsi's 0x80-0x9F block, which differs from Latin-1 (euro, quotes, dashes, oe, ...).
const WIN_ANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e,
  0x0178,
]);

const SOFT_HYPHEN = 0x00ad;

export function isWinAnsiEncodable(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint !== SOFT_HYPHEN;
  return WIN_ANSI_EXTRAS.has(codePoint);
}

function inRanges(codePoint: number, ranges: [number, number][]): boolean {
  return ranges.some(([from, to]) => codePoint >= from && codePoint <= to);
}

// Control characters and every Unicode space separator other than the plain space and the
// WinAnsi no-break space (U+00A0) become a plain space, so a pasted multi-line address stays on
// one drawn line instead of overprinting the text below it.
const SPACE_LIKE: [number, number][] = [
  [0x09, 0x0d], // tab, LF, VT, FF, CR
  [0x85, 0x85], // next line
  [0x1680, 0x1680],
  [0x2000, 0x200a], // en/em/thin/hair/figure... spaces
  [0x2028, 0x2029], // line / paragraph separators
  [0x202f, 0x202f], // narrow no-break space
  [0x205f, 0x205f],
  [0x3000, 0x3000],
];

// Invisible characters: dropped.
const INVISIBLE: [number, number][] = [
  [0x00, 0x1f], // remaining C0 controls
  [0x7f, 0x9f], // DEL + C1 controls
  [SOFT_HYPHEN, SOFT_HYPHEN],
  [0x061c, 0x061c], // Arabic letter mark
  [0x200b, 0x200f], // zero-width space/joiners, LRM/RLM
  [0x202a, 0x202e], // bidi embeddings/overrides
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0xfe00, 0xfe0f], // variation selectors
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
  [0xe0100, 0xe01ef], // variation selectors supplement
];

const COMBINING_MARKS: [number, number][] = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe20, 0xfe2f],
];

const REPLACEMENTS = new Map<number, string>([
  // Dashes and minus signs outside WinAnsi.
  [0x2010, '-'],
  [0x2011, '-'],
  [0x2012, '-'],
  [0x2015, String.fromCodePoint(0x2014)],
  [0x2212, '-'],
  // Quotes and primes outside WinAnsi.
  [0x201b, "'"],
  [0x201f, '"'],
  [0x2032, "'"],
  [0x2033, '"'],
  // Common symbols.
  [0x2264, '<='],
  [0x2265, '>='],
  [0x2248, '~'],
  [0x2192, '->'],
  [0x2190, '<-'],
  // Latin letters with no Unicode decomposition.
  [0x0141, 'L'], // L with stroke
  [0x0142, 'l'],
  [0x0110, 'D'], // D with stroke
  [0x0111, 'd'],
  [0x0126, 'H'], // H with stroke
  [0x0127, 'h'],
  [0x0131, 'i'], // dotless i
  [0x013f, 'L'], // L with middle dot
  [0x0140, 'l'],
  [0x0166, 'T'], // T with stroke
  [0x0167, 't'],
  [0x0138, 'k'], // kra
  [0x014a, 'N'], // eng
  [0x014b, 'n'],
  [0x018f, 'E'], // schwa
  [0x0259, 'e'],
]);

function mapSimple(codePoint: number): string | null {
  if (isWinAnsiEncodable(codePoint)) return String.fromCodePoint(codePoint);
  if (inRanges(codePoint, SPACE_LIKE)) return ' ';
  if (inRanges(codePoint, INVISIBLE)) return '';
  const replacement = REPLACEMENTS.get(codePoint);
  return replacement ?? null;
}

function sanitizeCodePoint(ch: string): string {
  const codePoint = ch.codePointAt(0)!;
  const simple = mapSimple(codePoint);
  if (simple !== null) return simple;
  if (inRanges(codePoint, COMBINING_MARKS)) return ''; // a lone combining mark

  // Compatibility-decompose and strip diacritics (U+011F -> "g", U+FB01 -> "fi"). The
  // decomposition can itself contain characters needing mapping (U+01C5 -> "D" + z-caron), so
  // map each part once more; anything still unencodable becomes "?".
  const parts = Array.from(ch.normalize('NFKD')).filter((part) => !inRanges(part.codePointAt(0)!, COMBINING_MARKS));
  if (parts.length === 0 || (parts.length === 1 && parts[0] === ch)) return '?';
  return parts.map((part) => mapSimple(part.codePointAt(0)!) ?? '?').join('');
}

export function toPdfSafeText(input: string): string {
  let out = '';
  for (const ch of Array.from(input.normalize('NFC'))) {
    out += sanitizeCodePoint(ch);
  }
  return out;
}

/** `page.drawText` that can never throw on unencodable user text. */
export function drawPdfText(page: PDFPage, text: string, options: PDFPageDrawTextOptions): void {
  page.drawText(toPdfSafeText(text), options);
}

/**
 * Greedy word-wrap of `text` into lines no wider than `maxWidth` at `size`. A single word wider
 * than `maxWidth` is hard-broken by character. The text is made PDF-safe first, so the returned
 * lines can be passed straight to `page.drawText`.
 */
export function wrapPdfText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const safe = toPdfSafeText(text).trim();
  if (safe === '') return [];
  const width = (s: string): number => font.widthOfTextAtSize(s, size);
  const lines: string[] = [];
  let current = '';
  const pushPiece = (piece: string): void => {
    if (width(piece) <= maxWidth) {
      current = piece;
      return;
    }
    let chunk = '';
    for (const ch of Array.from(piece)) {
      if (chunk !== '' && width(chunk + ch) > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  };
  // Break opportunities: spaces, and just after a hyphen inside a word ("Interrupteur-" /
  // "sectionneur"). `glue` is what joins a piece to the previous one on the same line.
  const pieces = safe.split(/ +/).flatMap((word) =>
    word.split(/(?<=-)(?=.)/).map((piece, i) => ({ piece, glue: i === 0 ? ' ' : '' })),
  );
  for (const { piece, glue } of pieces) {
    if (current === '') {
      pushPiece(piece);
    } else if (width(`${current}${glue}${piece}`) <= maxWidth) {
      current = `${current}${glue}${piece}`;
    } else {
      lines.push(current);
      current = '';
      pushPiece(piece);
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

/** True when every word (split at spaces and hyphens) fits `maxWidth` without being cut. */
export function wordsFitPdfWidth(font: PDFFont, text: string, size: number, maxWidth: number): boolean {
  return toPdfSafeText(text)
    .trim()
    .split(/ +/)
    .flatMap((word) => word.split(/(?<=-)(?=.)/))
    .every((piece) => piece === '' || font.widthOfTextAtSize(piece, size) <= maxWidth);
}

const ELLIPSIS = String.fromCodePoint(0x2026);

/**
 * Fits `text` inside a `maxWidth` x `maxHeight` area: wraps it, shrinking the font size from
 * `size` down to `minSize` until every line fits. If it still doesn't fit at `minSize`, the
 * line list is truncated with an ellipsis rather than overflowing the area.
 */
export function fitPdfText(
  font: PDFFont,
  text: string,
  options: { size: number; minSize: number; maxWidth: number; maxHeight: number; lineGap?: number },
): { lines: string[]; size: number; lineHeight: number } {
  const lineGap = options.lineGap ?? 1.2;
  for (let size = options.size; size >= options.minSize; size -= 0.5) {
    const lines = wrapPdfText(font, text, size, options.maxWidth);
    if (lines.length * size * lineGap <= options.maxHeight) {
      return { lines, size, lineHeight: size * lineGap };
    }
  }
  const size = options.minSize;
  const lineHeight = size * lineGap;
  const maxLines = Math.max(1, Math.floor(options.maxHeight / lineHeight));
  const lines = wrapPdfText(font, text, size, options.maxWidth);
  if (lines.length <= maxLines) {
    return { lines, size, lineHeight };
  }
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last.length > 0 && font.widthOfTextAtSize(`${last}${ELLIPSIS}`, size) > options.maxWidth) {
    last = last.slice(0, -1);
  }
  kept[maxLines - 1] = `${last}${ELLIPSIS}`;
  return { lines: kept, size, lineHeight };
}
