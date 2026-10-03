const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const MAGIC_BYTES: Record<string, { mimeType: 'pdf' | 'png' | 'jpeg'; bytes: number[] }> = {
  'application/pdf': { mimeType: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  'image/png': { mimeType: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { mimeType: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
};

export type ValidateUploadResult = { valid: true; mimeType: 'pdf' | 'png' | 'jpeg' } | { valid: false; error: string };

export function validateUploadedFile(buffer: Buffer, claimedMimeType: string, sizeBytes: number): ValidateUploadResult {
  if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return { valid: false, error: 'Le fichier dépasse la taille maximale autorisée (10 Mo).' };
  }

  const expected = MAGIC_BYTES[claimedMimeType];
  if (!expected) {
    return { valid: false, error: 'Type de fichier non autorisé.' };
  }

  const actualPrefix = buffer.subarray(0, expected.bytes.length);
  const matches = expected.bytes.every((byte, i) => actualPrefix[i] === byte);
  if (!matches) {
    return { valid: false, error: 'Le contenu du fichier ne correspond pas au type déclaré.' };
  }

  return { valid: true, mimeType: expected.mimeType };
}
