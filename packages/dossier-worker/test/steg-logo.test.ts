import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { loadStegLogo, tryLoadStegLogo } from '../src/steg-logo';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** Synthetic test PNG (white, 8-bit RGB), not a logo. */
function syntheticPng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 255)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('steg logo loader', () => {
  it('returns a PNG buffer no wider than 300 px', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'steg-logo-'));
    try {
      const path = join(dir, 'steg-logo.png');
      await writeFile(path, syntheticPng(120, 40));
      const logo = await loadStegLogo(path);
      expect([...logo.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(logo.readUInt32BE(16)).toBeLessThanOrEqual(300);
      const pdf = await PDFDocument.create();
      const image = await pdf.embedPng(logo);
      expect(image.width).toBe(120);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('loadStegLogo throws when the file is missing', async () => {
    await expect(loadStegLogo(join(tmpdir(), 'no-such-dir', 'steg-logo.png'))).rejects.toThrow();
  });

  it('tryLoadStegLogo returns null only when the file is missing', async () => {
    expect(await tryLoadStegLogo(join(tmpdir(), 'no-such-dir', 'steg-logo.png'))).toBeNull();
    // A directory is not a missing file: the error propagates.
    await expect(tryLoadStegLogo(tmpdir())).rejects.toThrow();
  });
});
