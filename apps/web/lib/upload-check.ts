/** The document types an installer may upload, recognised from the file's first bytes (not its name or declared type). */
export type SniffedType = 'application/pdf' | 'image/png' | 'image/jpeg';

export function sniffUploadType(buffer: Uint8Array): SniffedType | null {
  const startsWith = (...bytes: number[]): boolean => bytes.every((byte, index) => buffer[index] === byte);
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return 'application/pdf';
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  return null;
}

/**
 * The message for a refused document: the validator's reason, plus what to upload instead when the
 * content is clearly neither a PDF nor a PNG/JPEG image (a Word file, a screenshot of text, an archive…).
 */
export function documentUploadError(reason: string, buffer: Uint8Array): string {
  if (sniffUploadType(buffer) !== null) return reason;
  return `${reason} Ce fichier n’est ni un PDF ni une image (PNG ou JPEG) : joignez le document scanné ou photographié.`;
}
