import { FormReader } from '../../../../lib/form-reader';

/** The P2P form's fields as strings, to pre-fill the inputs. */
export interface P2pFormValues {
  p2pAccountHolder: string;
  p2pFlouciNumber: string;
  p2pIziNumber: string;
  p2pD17Number: string;
  p2pInstructions: string;
}

export interface P2pSettingsInput {
  p2pAccountHolder: string | null;
  p2pFlouciNumber: string | null;
  p2pIziNumber: string | null;
  p2pD17Number: string | null;
  p2pInstructions: string | null;
}

// A phone-like number: digits, spaces and an optional leading +.
const PHONE_PATTERN = /^\+?[0-9][0-9 ]{3,18}$/;

function readNumber(reader: FormReader, name: string, label: string): string | null {
  const value = reader.optionalText(name, label, 20);
  if (value !== null && !PHONE_PATTERN.test(value)) {
    reader.errors.push(`${label} : numéro invalide (chiffres, espaces et « + » uniquement).`);
  }
  return value;
}

/** Reads and validates the « Paiement P2P » form. Errors are collected on the reader. */
export function readP2pSettings(reader: FormReader): P2pSettingsInput {
  return {
    p2pAccountHolder: reader.optionalText('p2pAccountHolder', 'Titulaire du compte', 100),
    p2pFlouciNumber: readNumber(reader, 'p2pFlouciNumber', 'Numéro Flouci'),
    p2pIziNumber: readNumber(reader, 'p2pIziNumber', 'Numéro izi'),
    p2pD17Number: readNumber(reader, 'p2pD17Number', 'Numéro D17'),
    p2pInstructions: reader.optionalText('p2pInstructions', 'Instructions', 1000),
  };
}
