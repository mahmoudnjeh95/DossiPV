import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFRef, type PDFObject } from 'pdf-lib';

/**
 * Minimal content-stream interpreter for the PDFs this package's pdf-lib renderers produce, so
 * tests can assert on WHAT is drawn and WHERE (text, its position, line/path geometry, image
 * placement) instead of only counting pages — page-count-only tests let every Critical defect
 * of the first redesign pass through.
 *
 * Supports exactly the operators pdf-lib emits: q/Q/cm, BT/ET/Tf/TL/Tm/Td/T* /Tj, m/l/c/h/re and
 * the painting operators, rg/RG, Do. Text is decoded as WinAnsi (pdf-lib's StandardFonts).
 */

export interface DrawnText {
  text: string;
  x: number;
  y: number;
  size: number;
}

export interface DrawnPath {
  points: { x: number; y: number }[];
  closed: boolean;
  stroke: number[] | null;
  fill: number[] | null;
}

export interface DrawnImage {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageContent {
  width: number;
  height: number;
  texts: DrawnText[];
  paths: DrawnPath[];
  images: DrawnImage[];
}

type Matrix = [number, number, number, number, number, number];

// WinAnsi bytes 0x80-0x9F -> Unicode code points (0 = unused byte). Numeric on purpose, so no
// invisible control characters appear literally in this file.
const WIN_ANSI_80_9F = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];

function decodeWinAnsiHex(hex: string): string {
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    const codePoint = byte >= 0x80 && byte <= 0x9f ? WIN_ANSI_80_9F[byte - 0x80] || 0x3f : byte;
    out += String.fromCodePoint(codePoint);
  }
  return out;
}

function multiply(m: Matrix, n: Matrix): Matrix {
  // m × n, PDF row-vector convention: [a b c d e f] = [[a b 0][c d 0][e f 1]].
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: x * m[0] + y * m[2] + m[4], y: x * m[1] + y * m[3] + m[5] };
}

type Token = { kind: 'num'; value: number } | { kind: 'name'; value: string } | { kind: 'hex'; value: string } | { kind: 'op'; value: string } | { kind: 'other' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i += 1;
    } else if (ch === '<' && src[i + 1] !== '<') {
      const end = src.indexOf('>', i);
      tokens.push({ kind: 'hex', value: src.slice(i + 1, end).replace(/\s/g, '') });
      i = end + 1;
    } else if (ch === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '\\') j += 1;
        else if (src[j] === '(') depth += 1;
        else if (src[j] === ')') depth -= 1;
        j += 1;
      }
      tokens.push({ kind: 'other' });
      i = j;
    } else if (ch === '/') {
      let j = i + 1;
      while (j < src.length && !/[\s/[\]<>()]/.test(src[j]!)) j += 1;
      tokens.push({ kind: 'name', value: src.slice(i + 1, j) });
      i = j;
    } else if (ch === '[' || ch === ']') {
      tokens.push({ kind: 'other' });
      i += 1;
    } else if (/[-+.\d]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[.\d]/.test(src[j]!)) j += 1;
      tokens.push({ kind: 'num', value: parseFloat(src.slice(i, j)) });
      i = j;
    } else {
      let j = i + 1;
      while (j < src.length && !/[\s/[\]<>()]/.test(src[j]!)) j += 1;
      tokens.push({ kind: 'op', value: src.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

function interpret(src: string, width: number, height: number): PageContent {
  const page: PageContent = { width, height, texts: [], paths: [], images: [] };
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let fill: number[] | null = [0, 0, 0];
  let stroke: number[] | null = [0, 0, 0];
  const stack: { ctm: Matrix; fill: number[] | null; stroke: number[] | null }[] = [];
  let textMatrix: Matrix = [1, 0, 0, 1, 0, 0];
  let lineMatrix: Matrix = [1, 0, 0, 1, 0, 0];
  let leading = 0;
  let fontSize = 0;
  let subpaths: { points: { x: number; y: number }[]; closed: boolean }[] = [];
  let current: { points: { x: number; y: number }[]; closed: boolean } | null = null;
  let operands: Token[] = [];

  const nums = (): number[] => operands.filter((t): t is { kind: 'num'; value: number } => t.kind === 'num').map((t) => t.value);
  const paint = (doStroke: boolean, doFill: boolean): void => {
    for (const sp of subpaths) {
      page.paths.push({ points: sp.points, closed: sp.closed, stroke: doStroke ? stroke : null, fill: doFill ? fill : null });
    }
    subpaths = [];
    current = null;
  };

  for (const token of tokenize(src)) {
    if (token.kind !== 'op') {
      operands.push(token);
      continue;
    }
    const n = nums();
    switch (token.value) {
      case 'q':
        stack.push({ ctm, fill, stroke });
        break;
      case 'Q': {
        const saved = stack.pop();
        if (saved) ({ ctm, fill, stroke } = saved);
        break;
      }
      case 'cm':
        ctm = multiply(n as Matrix, ctm);
        break;
      case 'rg':
        fill = n.slice(0, 3);
        break;
      case 'RG':
        stroke = n.slice(0, 3);
        break;
      case 'g':
        fill = [n[0]!, n[0]!, n[0]!];
        break;
      case 'G':
        stroke = [n[0]!, n[0]!, n[0]!];
        break;
      case 'BT':
        textMatrix = [1, 0, 0, 1, 0, 0];
        lineMatrix = [1, 0, 0, 1, 0, 0];
        break;
      case 'Tf':
        fontSize = n[0] ?? fontSize;
        break;
      case 'TL':
        leading = n[0] ?? leading;
        break;
      case 'Tm':
        textMatrix = n as Matrix;
        lineMatrix = n as Matrix;
        break;
      case 'Td':
        lineMatrix = multiply([1, 0, 0, 1, n[0]!, n[1]!], lineMatrix);
        textMatrix = lineMatrix;
        break;
      case 'T*':
        lineMatrix = multiply([1, 0, 0, 1, 0, -leading], lineMatrix);
        textMatrix = lineMatrix;
        break;
      case 'Tj': {
        const hex = operands.find((t) => t.kind === 'hex');
        if (hex && hex.kind === 'hex') {
          const origin = apply(multiply(textMatrix, ctm), 0, 0);
          page.texts.push({ text: decodeWinAnsiHex(hex.value), x: origin.x, y: origin.y, size: fontSize });
        }
        break;
      }
      case 'm':
        current = { points: [apply(ctm, n[0]!, n[1]!)], closed: false };
        subpaths.push(current);
        break;
      case 'l':
        current?.points.push(apply(ctm, n[0]!, n[1]!));
        break;
      case 'c':
        current?.points.push(apply(ctm, n[4]!, n[5]!));
        break;
      case 'v':
      case 'y':
        current?.points.push(apply(ctm, n[2]!, n[3]!));
        break;
      case 'h':
        if (current) current.closed = true;
        break;
      case 're': {
        const [x, y, w, h] = n as [number, number, number, number];
        subpaths.push({ points: [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h)], closed: true });
        current = null;
        break;
      }
      case 'S':
        paint(true, false);
        break;
      case 's':
        if (current) current.closed = true;
        paint(true, false);
        break;
      case 'f':
      case 'F':
      case 'f*':
        paint(false, true);
        break;
      case 'B':
      case 'B*':
      case 'b':
      case 'b*':
        paint(true, true);
        break;
      case 'n':
        subpaths = [];
        current = null;
        break;
      case 'Do': {
        const corners = [apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 0, 1), apply(ctm, 1, 1)];
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        page.images.push({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
        break;
      }
      default:
        break;
    }
    operands = [];
  }
  return page;
}

function streamText(doc: PDFDocument, obj: PDFObject | undefined): string {
  if (!obj) return '';
  if (obj instanceof PDFArray) {
    return obj
      .asArray()
      .map((ref) => streamText(doc, doc.context.lookup(ref as PDFRef)))
      .join('\n');
  }
  if (obj instanceof PDFRawStream) {
    return Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1');
  }
  return '';
}

export async function extractPdfContent(buffer: Buffer | Uint8Array): Promise<PageContent[]> {
  const doc = await PDFDocument.load(buffer);
  return doc.getPages().map((p) => {
    const contents = p.node.Contents();
    const src = streamText(doc, contents);
    const { width, height } = p.getSize();
    return interpret(src, width, height);
  });
}

/** Each page's decoded content stream, for asserting on raw operators (e.g. a fill colour). */
export async function rawPageStreams(buffer: Buffer | Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(buffer);
  return doc.getPages().map((p) => streamText(doc, p.node.Contents()));
}

/** Joined text of one page, in drawing order — handy for `toContain` assertions. */
export function pageText(page: PageContent): string {
  return page.texts.map((t) => t.text).join('\n');
}

export function findText(page: PageContent, needle: string | RegExp): DrawnText | undefined {
  return page.texts.find((t) => (typeof needle === 'string' ? t.text.includes(needle) : needle.test(t.text)));
}

/** True when every drawn text origin, path point and image corner lies on the page. */
export function everythingOnPage(page: PageContent, tolerance = 0.5): boolean {
  const inside = (x: number, y: number): boolean => x >= -tolerance && y >= -tolerance && x <= page.width + tolerance && y <= page.height + tolerance;
  return (
    page.texts.every((t) => inside(t.x, t.y)) &&
    page.paths.every((p) => p.points.every((pt) => inside(pt.x, pt.y))) &&
    page.images.every((img) => inside(img.x, img.y) && inside(img.x + img.width, img.y + img.height))
  );
}

/** The BaseFont name of every font the PDF embeds (e.g. `Times-Roman`), deduplicated. */
export async function pdfFontNames(buffer: Buffer | Uint8Array): Promise<Set<string>> {
  const doc = await PDFDocument.load(buffer);
  return new Set(
    doc.context
      .enumerateIndirectObjects()
      .map(([, object]) => object.toString())
      .filter((text) => text.includes('/Type /Font'))
      .map((text) => /\/BaseFont \/(\S+)/.exec(text)?.[1] ?? '?'),
  );
}

/** The two Times faces every pdf-lib fragment of the dossier uses (one font family, Task 17). */
export const TIMES_FONTS = new Set(['Times-Roman', 'Times-Bold']);
