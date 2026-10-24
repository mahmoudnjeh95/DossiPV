import type { FormReader } from './form-reader';

// One rule for every password form, from the auth package.
export { MIN_PASSWORD_LENGTH } from '@dossipv/auth';
import { MIN_PASSWORD_LENGTH } from '@dossipv/auth';
/** bcrypt ignores everything past 72 bytes, so a longer password would not be what it seems. */
const MAX_PASSWORD_LENGTH = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
