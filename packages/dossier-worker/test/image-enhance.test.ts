import { describe, it, expect } from 'vitest';
import { decodeJpegBitmap, encodeJpegBitmap, enhanceSatelliteImage, resizeLanczos, unsharpMask, type Bitmap } from '../src/image-enhance';

/** A checkerboard of `cell`-pixel squares: sharp edges to measure detail on. */
function checkerboard(size: number, cell: number): Bitmap {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 40 : 210;
      data.set([value, value, value, 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

/** Mean absolute difference between horizontal neighbours: higher is sharper. */
function edgeEnergy(bitmap: Bitmap): number {
  let sum = 0;
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 1; x < bitmap.width; x += 1) sum += Math.abs(bitmap.data[(y * bitmap.width + x) * 4]! - bitmap.data[(y * bitmap.width + x - 1) * 4]!);
  }
  return sum / (bitmap.height * (bitmap.width - 1));
}

describe('resizeLanczos', () => {
  it('doubles the size and keeps a flat colour flat', () => {
    const flat: Bitmap = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4).fill(128) };
    const out = resizeLanczos(flat, 16, 16);
    expect(out.width).toBe(16);
    expect(out.height).toBe(16);
    for (let i = 0; i < out.data.length; i += 4) expect(out.data[i]).toBe(128);
  });
});

describe('unsharpMask', () => {
  it('adds edge contrast to an upscaled image', () => {
    const upscaled = resizeLanczos(checkerboard(32, 4), 64, 64);
    expect(edgeEnergy(unsharpMask(upscaled, 1, 0.9))).toBeGreaterThan(edgeEnergy(upscaled));
  });
});

describe('enhanceSatelliteImage', () => {
  it('returns a JPEG twice as large in each dimension', () => {
    const jpeg = encodeJpegBitmap(checkerboard(64, 8), 85);
    const enhanced = decodeJpegBitmap(enhanceSatelliteImage(jpeg, 2));
    expect(enhanced.width).toBe(128);
    expect(enhanced.height).toBe(128);
  });

  it('caps the longest side', () => {
    const jpeg = encodeJpegBitmap(checkerboard(64, 8), 80);
    const enhanced = decodeJpegBitmap(enhanceSatelliteImage(jpeg, 2, 100));
    expect(enhanced.width).toBe(100);
  });

  it('only sharpens at factor 1', () => {
    const jpeg = encodeJpegBitmap(checkerboard(64, 8), 80);
    expect(decodeJpegBitmap(enhanceSatelliteImage(jpeg, 1)).width).toBe(64);
  });

  it('returns bytes it cannot decode unchanged', () => {
    const notJpeg = Buffer.from('not a jpeg');
    expect(enhanceSatelliteImage(notJpeg)).toBe(notJpeg);
  });
});
