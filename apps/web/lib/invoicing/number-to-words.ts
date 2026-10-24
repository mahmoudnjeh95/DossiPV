/** French number-to-words for the "Arrêtée la présente facture à la somme de" sentence. */

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
  'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0..99; `final` is false when a word follows ("quatre-vingt mille" has no "s"). */
function belowHundred(n: number, final: boolean): string {
  if (n < 20) return UNITS[n]!;
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7) return unit === 1 ? 'soixante et onze' : `soixante-${UNITS[10 + unit]}`;
  if (ten === 8) return unit === 0 ? `quatre-vingt${final ? 's' : ''}` : `quatre-vingt-${UNITS[unit]}`;
  if (ten === 9) return `quatre-vingt-${UNITS[10 + unit]}`;
  if (unit === 0) return TENS[ten]!;
  return unit === 1 ? `${TENS[ten]} et un` : `${TENS[ten]}-${UNITS[unit]}`;
}

/** 0..999; `final` is true when nothing invariable follows (the "s" of "quatre-vingts" and "cents"). */
function belowThousand(n: number, final: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return belowHundred(rest, final);
  const head = hundreds === 1 ? 'cent' : `${UNITS[hundreds]} cent${rest === 0 && final ? 's' : ''}`;
  return rest === 0 ? head : `${head} ${belowHundred(rest, final)}`;
}

/** A whole number from 0 to 999 999 999 in French words. */
export function numberToFrenchWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) {
    throw new RangeError(`Nombre hors limites : ${n}`);
  }
  if (n === 0) return 'zéro';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) {
    parts.push(millions === 1 ? 'un million' : `${belowThousand(millions, true)} millions`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${belowThousand(thousands, false)} mille`);
  }
  if (rest > 0) parts.push(belowThousand(rest, true));
  return parts.join(' ');
}

/** "cent dix-neuf dinars et huit cent quatre-vingts millimes" for an amount in millimes. */
export function tndInFrenchWords(millimes: bigint): string {
  if (millimes < 0n) throw new RangeError('Montant négatif.');
  const dinars = Number(millimes / 1000n);
  const mills = Number(millimes % 1000n);
  const dinarPart = `${numberToFrenchWords(dinars)} ${dinars > 1 ? 'dinars' : 'dinar'}`;
  if (mills === 0) return dinarPart;
  return `${dinarPart} et ${numberToFrenchWords(mills)} ${mills > 1 ? 'millimes' : 'millime'}`;
}
