import type { FormReader } from './form-reader';

// One rule for every password form, from the auth package.
export { MIN_PASSWORD_LENGTH } from '@dossipv/auth';
import { MIN_PASSWORD_LENGTH } from '@dossipv/auth';
/** bcrypt ignores everything past 72 bytes, so a longer password would not be what it seems. */
const MAX_PASSWORD_LENGTH = 72;
/** No whitespace, comma, semicolon, angle bracket, quote or bracket: nodemailer would read those as several recipients or a display name. */
export const EMAIL_PATTERN = /^[^\s@,;<>"'()\[\]]+@[^\s@,;<>"'()\[\]]+\.[^\s@,;<>"'()\[\]]+$/;

/** A login email as stored: trimmed and lower-cased, so one address can never become two accounts. */
export function readLoginEmail(reader: FormReader, name: string, label: string): string {
  const email = reader.text(name, label, 200).toLowerCase();
  if (email.length > 0 && !EMAIL_PATTERN.test(email)) {
    reader.errors.push(`${label} : adresse invalide.`);
  }
  return email;
}

/** A new password, kept exactly as typed (FormReader trims, which would change it). */
export function readNewPassword(reader: FormReader, formData: FormData, name: string, label: string): string {
  const value = formData.get(name);
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    reader.errors.push(`${label} : ${MIN_PASSWORD_LENGTH} caractères minimum.`);
    return '';
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    reader.errors.push(`${label} : ${MAX_PASSWORD_LENGTH} caractères maximum.`);
    return '';
  }
  return value;
}

/** A Tunisian phone number: 8 digits, with an optional +216 / 00216 prefix; spaces, dots and dashes are allowed. */
export function isTunisianPhone(value: string): boolean {
  if (!/^[+\d\s.-]+$/.test(value)) return false;
  const digits = value.replace(/[\s.-]/g, '').replace(/^(\+216|00216)/, '');
  return /^\d{8}$/.test(digits);
}

/** A required phone number, checked to be Tunisian (8 digits, optional +216); kept as typed. */
export function readTunisianPhone(reader: FormReader, name: string, label: string): string {
  const phone = reader.text(name, label, 30);
  if (phone.length > 0 && !isTunisianPhone(phone)) {
    reader.errors.push(`${label} : numéro tunisien invalide (8 chiffres, avec ou sans +216, ex. 98 123 456).`);
  }
  return phone;
}
