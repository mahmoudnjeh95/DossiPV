import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatTnd, tndToMillimes } from './amounts';
import { tndInFrenchWords } from './number-to-words';
import type { InvoiceDocument, InvoiceParty } from './types';

// pdf-lib is imported directly: only the worker declares it, but npm hoists it to the root node_modules.

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BLUE = rgb(0.12, 0.31, 0.6);
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.92, 0.94, 0.98);

/**
 * pdf-lib's standard fonts encode WinAnsi only and THROW on anything else. French text passes
 * unchanged; other letters lose their diacritics and what is left becomes "?", so a name typed in
 * Arabic can never make an invoice fail (same rule as the dossier worker's `toPdfSafeText`).
 */
export function toInvoiceSafeText(input: string): string {
  let out = '';
  for (const ch of Array.from(input.normalize('NFC'))) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff && code !== 0xad) || WIN_ANSI_EXTRAS.has(code)) {
      out += ch;
    } else if (/\s/.test(ch)) {
      out += ' ';
    } else {
      const base = Array.from(ch.normalize('NFKD')).filter((part) => !/\p{M}/u.test(part));
      out += base.length > 0 && base.every((part) => part.codePointAt(0)! >= 0x20 && part.codePointAt(0)! <= 0x7e) ? base.join('') : '?';
    }
  }
  return out;
}
const WIN_ANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Greedy word-wrap of already-safe text. */
function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of toInvoiceSafeText(text).split(/\n/)) {
    let current = '';
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current === '') {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current !== '') lines.push(current);
  }
  return lines;
}

function frenchDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

const METHOD_LABELS: Record<string, string> = { MANUAL: 'Paiement enregistré manuellement', KONNECT: 'Paiement en ligne (Konnect)' };
export function paymentMethodLabel(method: string): string {
  return METHOD_LABELS[method] ?? (method === 'FLOUCI' ? 'Paiement en ligne (Flouci)' : method === 'D17' ? 'Paiement en ligne (D17)' : method === 'IZI' ? 'Paiement en ligne (izi)' : method);
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

function text(page: PDFPage, value: string, x: number, y: number, size: number, font: PDFFont, color = BLACK): void {
  page.drawText(toInvoiceSafeText(value), { x, y, size, font, color });
}

function textRight(page: PDFPage, value: string, right: number, y: number, size: number, font: PDFFont, color = BLACK): void {
  const safe = toInvoiceSafeText(value);
  page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, size), y, size, font, color });
}

/** A titled block (seller or buyer). Returns the y under its last line. */
function drawParty(page: PDFPage, fonts: Fonts, title: string, party: InvoiceParty, x: number, top: number, width: number): number {
  text(page, title.toUpperCase(), x, top, 9, fonts.bold, BLUE);
  let y = top - 15;
  for (const line of wrap(fonts.bold, party.name, 12, width)) {
    text(page, line, x, y, 12, fonts.bold);
    y -= 14;
  }
  const rows: [string, string | null | undefined][] = [
    ['Matricule fiscal', party.taxId],
    ['Registre de commerce', party.commercialRegister],
    ['Adresse', party.address],
    ['Téléphone', party.phone],
    ['Email', party.email],
  ];
  for (const [label, value] of rows) {
    if (!value) continue;
    const labelText = `${label} : `;
    const labelWidth = fonts.regular.widthOfTextAtSize(labelText, 10);
    wrap(fonts.regular, value, 10, width - labelWidth).forEach((line, i) => {
      if (i === 0) text(page, labelText, x, y, 10, fonts.regular, GREY);
      text(page, line, x + labelWidth, y, 10, fonts.regular);
      y -= 13;
    });
  }
  return y;
}

/** Renders the invoice as a one-page (more if the lines need it) A4 portrait PDF. */
export async function renderInvoicePdf(invoice: InvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Facture ${invoice.number}`);
  pdf.setProducer('DossiPV');
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Title and date
  text(page, `FACTURE N° ${invoice.number}`, MARGIN, PAGE_HEIGHT - 70, 22, fonts.bold, BLUE);
  textRight(page, `Date : ${frenchDate(invoice.issuedAt)}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 70, 12, fonts.regular);
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 82 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 82 }, thickness: 1.2, color: BLUE });

  // Seller / buyer
  const blockWidth = (CONTENT_WIDTH - 30) / 2;
  const top = PAGE_HEIGHT - 110;
  const sellerEnd = drawParty(page, fonts, 'Émetteur', invoice.seller, MARGIN, top, blockWidth);
  const buyerEnd = drawParty(page, fonts, 'Client', invoice.buyer, MARGIN + blockWidth + 30, top, blockWidth);
  let y = Math.min(sellerEnd, buyerEnd) - 25;

  // Lines table
  const cols = { desc: MARGIN + 6, period: MARGIN + 195, unit: MARGIN + 290, amount: PAGE_WIDTH - MARGIN - 6 };
  const descWidth = cols.period - cols.desc - 12;
  const drawHeader = (): void => {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_WIDTH, height: 22, color: LIGHT });
    text(page, 'Désignation', cols.desc, y, 10.5, fonts.bold);
    text(page, 'Quantité / période', cols.period, y, 10.5, fonts.bold);
    textRight(page, 'Prix unitaire HT', cols.unit + 100, y, 10.5, fonts.bold);
    textRight(page, 'Montant HT', cols.amount, y, 10.5, fonts.bold);
    y -= 24;
  };
  drawHeader();
  for (const line of invoice.lines) {
    const descLines = wrap(fonts.regular, line.description, 11, descWidth);
    const rowHeight = Math.max(1, descLines.length) * 14;
    if (y - rowHeight < 260) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 70;
      drawHeader();
    }
    descLines.forEach((descLine, i) => text(page, descLine, cols.desc, y - i * 14, 11, fonts.regular));
    text(page, line.period ?? String(line.quantity), cols.period, y, 11, fonts.regular);
    textRight(page, `${formatTnd(tndToMillimes(line.unitHtTnd))} TND`, cols.unit + 100, y, 11, fonts.regular);
    textRight(page, `${formatTnd(tndToMillimes(line.totalHtTnd))} TND`, cols.amount, y, 11, fonts.regular);
    y -= rowHeight + 6;
    page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 8 }, thickness: 0.4, color: GREY });
  }

  // Totals
  if (y < 240) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - 70;
  }
  y -= 14;
  const labelX = PAGE_WIDTH - MARGIN - 230;
  const totals: [string, string, boolean][] = [
    ['Total HT', invoice.totalHtTnd, false],
    [`TVA ${trimRate(invoice.vatRatePct)} %`, invoice.vatTnd, false],
    ['Droit de timbre', invoice.stampTnd, false],
    ['Total TTC', invoice.totalTtcTnd, true],
  ];
  for (const [label, amount, strong] of totals) {
    if (strong) {
      page.drawRectangle({ x: labelX - 8, y: y - 6, width: 238, height: 22, color: LIGHT });
    }
    const font = strong ? fonts.bold : fonts.regular;
    text(page, label, labelX, y, strong ? 12 : 11, font);
    textRight(page, `${formatTnd(tndToMillimes(amount))} TND`, PAGE_WIDTH - MARGIN - 6, y, strong ? 12 : 11, font);
    y -= strong ? 28 : 18;
  }

  // Amount in words, payment
  y -= 10;
  const sentence = `Arrêtée la présente facture à la somme de : ${tndInFrenchWords(tndToMillimes(invoice.totalTtcTnd))}.`;
  for (const line of wrap(fonts.italic, sentence, 11.5, CONTENT_WIDTH)) {
    text(page, line, MARGIN, y, 11.5, fonts.italic);
    y -= 15;
  }
  y -= 8;
  text(page, `Mode de paiement : ${paymentMethodLabel(invoice.paymentMethod)}`, MARGIN, y, 11, fonts.regular);
  y -= 15;
  text(page, `Date de paiement : ${frenchDate(invoice.paidAt)}`, MARGIN, y, 11, fonts.regular);

  // Footer, on the last page
  if (invoice.footer) {
    const footerLines = wrap(fonts.regular, invoice.footer, 9, CONTENT_WIDTH);
    page.drawLine({ start: { x: MARGIN, y: 70 + footerLines.length * 11 }, end: { x: PAGE_WIDTH - MARGIN, y: 70 + footerLines.length * 11 }, thickness: 0.5, color: GREY });
    footerLines.forEach((line, i) => text(page, line, MARGIN, 60 + (footerLines.length - 1 - i) * 11, 9, fonts.regular, GREY));
  }

  return pdf.save();
}

/** "19.00" -> "19", "5.50" -> "5,5" */
function trimRate(rate: string): string {
  return String(Number(rate)).replace('.', ',');
}
