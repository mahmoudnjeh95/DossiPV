import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';

/** An RGBA bitmap, row-major. */
export interface Bitmap {
  width: number;
  height: number;
  data: Uint8Array;
}

const LANCZOS_A = 3;

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function lanczos(x: number): number {
  return Math.abs(x) >= LANCZOS_A ? 0 : sinc(x) * sinc(x / LANCZOS_A);
}

/** For each output index, the first source index and the normalised Lanczos-3 weights. */
function weights(srcSize: number, dstSize: number): { start: number; w: Float32Array }[] {
  const scale = srcSize / dstSize;
  const support = LANCZOS_A * Math.max(1, scale);
  return Array.from({ length: dstSize }, (_, i) => {
    const centre = (i + 0.5) * scale - 0.5;
    const start = Math.max(0, Math.floor(centre - support));
    const end = Math.min(srcSize - 1, Math.ceil(centre + support));
    const w = new Float32Array(end - start + 1);
    let sum = 0;
    for (let k = start; k <= end; k += 1) {
      const value = lanczos((k - centre) / Math.max(1, scale));
      w[k - start] = value;
      sum += value;
    }
    for (let k = 0; k < w.length; k += 1) w[k] = w[k]! / (sum || 1);
    return { start, w };
  });
}

/** Resamples with a Lanczos-3 filter: much crisper than the bilinear scaling a PDF viewer applies when zoomed in. */
export function resizeLanczos(src: Bitmap, width: number, height: number): Bitmap {
  const horizontal = weights(src.width, width);
  const vertical = weights(src.height, height);
  // Horizontal pass into floats (RGB only; alpha is opaque for satellite imagery).
  const mid = new Float32Array(width * src.height * 3);
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { start, w } = horizontal[x]!;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < w.length; k += 1) {
        const at = (y * src.width + start + k) * 4;
        const weight = w[k]!;
        r += src.data[at]! * weight;
        g += src.data[at + 1]! * weight;
        b += src.data[at + 2]! * weight;
      }
      const out = (y * width + x) * 3;
      mid[out] = r;
      mid[out + 1] = g;
      mid[out + 2] = b;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const { start, w } = vertical[y]!;
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < w.length; k += 1) {
        const at = ((start + k) * width + x) * 3;
        const weight = w[k]!;
        r += mid[at]! * weight;
        g += mid[at + 1]! * weight;
        b += mid[at + 2]! * weight;
      }
      const out = (y * width + x) * 4;
      data[out] = clamp(r);
      data[out + 1] = clamp(g);
      data[out + 2] = clamp(b);
      data[out + 3] = 255;
    }
  }
  return { width, height, data };
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

/** One horizontal then vertical box blur of the given radius over the RGB channels. */
function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = 2 * radius + 1;
  for (let y = 0; y < height; y += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) sum += src[(y * width + Math.min(width - 1, Math.max(0, k))) * 3 + c]!;
      for (let x = 0; x < width; x += 1) {
        tmp[(y * width + x) * 3 + c] = sum / span;
        const add = Math.min(width - 1, x + radius + 1);
        const drop = Math.max(0, x - radius);
        sum += src[(y * width + add) * 3 + c]! - src[(y * width + drop) * 3 + c]!;
      }
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) sum += tmp[(Math.min(height - 1, Math.max(0, k)) * width + x) * 3 + c]!;
      for (let y = 0; y < height; y += 1) {
        out[(y * width + x) * 3 + c] = sum / span;
        const add = Math.min(height - 1, y + radius + 1);
        const drop = Math.max(0, y - radius);
        sum += tmp[(add * width + x) * 3 + c]! - tmp[(drop * width + x) * 3 + c]!;
      }
    }
  }
  return out;
}

/** Unsharp mask: adds back `amount` of the detail a Gaussian-like blur removed (three box passes ≈ a Gaussian). */
export function unsharpMask(bitmap: Bitmap, radius: number, amount: number): Bitmap {
  const { width, height } = bitmap;
  const base = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    base[i * 3] = bitmap.data[i * 4]!;
    base[i * 3 + 1] = bitmap.data[i * 4 + 1]!;
    base[i * 3 + 2] = bitmap.data[i * 4 + 2]!;
  }
  let blurred: Float32Array = base;
  for (let pass = 0; pass < 3; pass += 1) blurred = boxBlur(blurred, width, height, radius);
  const data = new Uint8Array(bitmap.data.length);
  for (let i = 0; i < width * height; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      const original = base[i * 3 + c]!;
      data[i * 4 + c] = clamp(original + amount * (original - blurred[i * 3 + c]!));
    }
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

export function decodeJpegBitmap(buffer: Buffer): Bitmap {
  return decodeJpeg(buffer, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 40 });
}

export function encodeJpegBitmap(bitmap: Bitmap, quality = 92): Buffer {
  return Buffer.from(encodeJpeg({ data: bitmap.data, width: bitmap.width, height: bitmap.height }, quality).data);
}

/** Longest side of an enhanced image, so a very large view never makes a huge PDF. */
const MAX_ENHANCED_SIDE_PX = 2400;

/**
 * Makes a satellite JPEG hold up when zoomed in: Lanczos upscaling (up to `factor`, capped so the
 * longest side stays ≤ 2 400 px) then an unsharp mask. The geographic bounds are unchanged — only
 * the pixel density grows — so a renderer that maps overlays through the view's own pixel size
 * keeps working. Returns the input unchanged when it cannot be decoded.
 */
export function enhanceSatelliteImage(jpeg: Buffer, factor = 2, maxSidePx = MAX_ENHANCED_SIDE_PX): Buffer {
  let bitmap: Bitmap;
  try {
    bitmap = decodeJpegBitmap(jpeg);
  } catch {
    return jpeg;
  }
  const scale = Math.min(factor, maxSidePx / Math.max(bitmap.width, bitmap.height));
  const resized = scale > 1.01 ? resizeLanczos(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale)) : bitmap;
  return encodeJpegBitmap(unsharpMask(resized, 1, 0.9), 92);
}
