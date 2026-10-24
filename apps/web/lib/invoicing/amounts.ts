/**
 * Invoice arithmetic, in whole millimes (1 TND = 1000 millimes) and BigInt, so no float ever
 * accumulates an error. The Payment's amount is the TTC total actually paid: the HT base and the
 * VAT are computed back from it.
 */

type Decimalish = { toString(): string } | number | string;

export interface InvoiceAmounts {
  totalHtMillimes: bigint;
  vatMillimes: bigint;
  stampMillimes: bigint;
  totalTtcMillimes: bigint;
}

/** Parses a TND amount (Prisma Decimal, string or number) into millimes, rounding half up. */
export function tndToMillimes(value: Decimalish): bigint {
  const text = typeof value === 'number' ? value.toFixed(6) : value.toString().trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    throw new Error(`Montant invalide : ${text}`);
  }
  const fraction = (match[3] ?? '').padEnd(4, '0');
  let millimes = BigInt(match[2]!) * 1000n + BigInt(fraction.slice(0, 3));
  if (fraction.charCodeAt(3) >= 53) millimes += 1n; // fourth decimal >= 5
  return match[1] === '-' ? -millimes : millimes;
}

/** `119000n` -> `"119.000"`. */
export function millimesToDecimalString(millimes: bigint): string {
  const negative = millimes < 0n;
  const abs = negative ? -millimes : millimes;
  return `${negative ? '-' : ''}${abs / 1000n}.${(abs % 1000n).toString().padStart(3, '0')}`;
}

/** `1119000n` -> `"1 119,000"`, with a no-break space between thousands (French display). */
export function formatTnd(millimes: bigint): string {
  const [integer, fraction] = millimesToDecimalString(millimes).split('.');
  const grouped = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped},${fraction}`;
}

/** A percentage as hundredths of a percent (19 -> 1900n, 19.5 -> 1950n). */
function percentToHundredths(percent: Decimalish): bigint {
  const thousandths = tndToMillimes(percent); // the same decimal parser: 19.5 -> 19500
  return (thousandths + 5n) / 10n;
}

/**
 * HT = (TTC - stamp) / (1 + vat/100) rounded to the millime (half up); VAT = TTC - stamp - HT, so
 * the lines always add up to the TTC exactly. A stamp larger than the TTC is capped to it.
 */
export function computeInvoiceAmounts(ttc: Decimalish, stamp: Decimalish, vatRatePct: Decimalish): InvoiceAmounts {
  const totalTtcMillimes = tndToMillimes(ttc);
  if (totalTtcMillimes < 0n) {
    throw new Error('Le montant TTC ne peut pas être négatif.');
  }
  const requestedStamp = tndToMillimes(stamp);
  const stampMillimes = requestedStamp < 0n ? 0n : requestedStamp > totalTtcMillimes ? totalTtcMillimes : requestedStamp;
  const rate = percentToHundredths(vatRatePct);
  if (rate < 0n) {
    throw new Error('Le taux de TVA ne peut pas être négatif.');
  }
  const base = totalTtcMillimes - stampMillimes;
  const divisor = 10000n + rate;
  const totalHtMillimes = (base * 10000n * 2n + divisor) / (divisor * 2n); // round half up
  return { totalHtMillimes, vatMillimes: base - totalHtMillimes, stampMillimes, totalTtcMillimes };
}
