const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

type UploadMimeType = 'pdf' | 'png' | 'jpeg' | 'webp';

/** Each signature is a list of [offset, bytes] runs that must all match. WebP = "RIFF" + 4 size bytes + "WEBP". */
const MAGIC_BYTES: Record<string, { mimeType: UploadMimeType; runs: Array<[number, number[]]> }> = {
  'application/pdf': { mimeType: 'pdf', runs: [[0, [0x25, 0x50, 0x44, 0x46]]] },
  'image/png': { mimeType: 'png', runs: [[0, [0x89, 0x50, 0x4e, 0x47]]] },
  'image/jpeg': { mimeType: 'jpeg', runs: [[0, [0xff, 0xd8, 0xff]]] },
  'image/webp': {
    mimeType: 'webp',
    runs: [
      [0, [0x52, 0x49, 0x46, 0x46]],
      [8, [0x57, 0x45, 0x42, 0x50]],
    ],
  },
};

export type ValidateUploadResult = { valid: true; mimeType: UploadMimeType } | { valid: false; error: string };

export interface ValidateUploadOptions {
  /** WebP cannot be embedded by pdf-lib: only callers that convert it (the bill import) opt in. */
  allowWebp?: boolean;
}

export function validateUploadedFile(
  buffer: Buffer,
  claimedMimeType: string,
  sizeBytes: number,
  { allowWebp = false }: ValidateUploadOptions = {},
): ValidateUploadResult {
  if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return { valid: false, error: 'Le fichier dépasse la taille maximale autorisée (10 Mo).' };
  }

  const expected = MAGIC_BYTES[claimedMimeType];
  if (!expected || (expected.mimeType === 'webp' && !allowWebp)) {
    return { valid: false, error: 'Type de fichier non autorisé.' };
  }

  const matches = expected.runs.every(([offset, bytes]) => bytes.every((byte, i) => buffer[offset + i] === byte));
  if (!matches) {
    return { valid: false, error: 'Le contenu du fichier ne correspond pas au type déclaré.' };
  }

  return { valid: true, mimeType: expected.mimeType };
}
