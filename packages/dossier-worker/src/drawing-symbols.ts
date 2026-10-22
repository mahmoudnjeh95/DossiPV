import { rgb, type PDFPage, type RGB } from 'pdf-lib';

/**
 * IEC 60617-style symbols for the electrical drawings, as SVG path data in a local frame whose
 * origin is the symbol's top-left corner and whose y axis points down. Series devices flow left to
 * right (`in` on the left edge, `out` on the right); the shunt devices (`spd`, `earth`,
 * `distributionBlock`) hang from a conductor and reach the earth through their `earth` anchor.
 */
export type SymbolKind =
  | 'pvString'
  | 'fuse'
  | 'switchDisconnector'
  | 'breaker'
  | 'rcdBreaker'
  | 'spd'
  | 'inverter'
  | 'meter'
  | 'earth'
  | 'distributionBlock';

export interface Point {
  x: number;
  y: number;
}

export interface SymbolDef {
  path: string;
  width: number;
  height: number;
  anchors: { in: Point; out: Point; earth?: Point };
}

/** A polygon approximating a circle or ellipse, as path data (the helpers read M/L paths only). */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const steps = 16;
  const points = Array.from({ length: steps }, (_, i) => {
    const angle = (2 * Math.PI * i) / steps;
    return `${(cx + rx * Math.cos(angle)).toFixed(2)} ${(cy + ry * Math.sin(angle)).toFixed(2)}`;
  });
  return `M ${points.join(' L ')} Z`;
}

export const SYMBOLS: Record<SymbolKind, SymbolDef> = {
  // A module: rectangle, diagonal and a cell line.
  pvString: {
    path: 'M 0 16 L 4 16 M 40 16 L 44 16 M 4 2 L 40 2 L 40 30 L 4 30 Z M 4 30 L 40 2 M 22 2 L 22 30',
    width: 44,
    height: 32,
    anchors: { in: { x: 0, y: 16 }, out: { x: 44, y: 16 } },
  },
  fuse: {
    path: 'M 0 14 L 5 14 M 23 14 L 28 14 M 5 9 L 23 9 L 23 19 L 5 19 Z M 5 14 L 23 14',
    width: 28,
    height: 28,
    anchors: { in: { x: 0, y: 14 }, out: { x: 28, y: 14 } },
  },
  // Isolating blade with a small bar across its free end.
  switchDisconnector: {
    path: 'M 0 14 L 7 14 M 21 14 L 28 14 M 7 14 L 19 4 M 16 3 L 22 9',
    width: 28,
    height: 28,
    anchors: { in: { x: 0, y: 14 }, out: { x: 28, y: 14 } },
  },
  // Blade with the cross at the fixed contact (the breaking function).
  breaker: {
    path: 'M 0 14 L 7 14 M 21 14 L 28 14 M 7 14 L 19 4 M 18 11 L 24 17 M 18 17 L 24 11',
    width: 28,
    height: 28,
    anchors: { in: { x: 0, y: 14 }, out: { x: 28, y: 14 } },
  },
  // The breaker plus the toroid of the residual-current function around the conductor.
  rcdBreaker: {
    path: `M 0 14 L 6 14 M 30 14 L 36 14 M 6 14 L 17 4 M 16 11 L 22 17 M 16 17 L 22 11 M 22 14 L 26 14 ${ellipse(30, 14, 4.5, 4.5)}`,
    width: 36,
    height: 28,
    anchors: { in: { x: 0, y: 14 }, out: { x: 36, y: 14 } },
  },
  // Varistor box with the arrow towards the earth.
  spd: {
    path: 'M 14 0 L 14 7 M 8 7 L 20 7 L 20 21 L 8 21 Z M 14 10 L 14 18 M 11 15 L 14 18 L 17 15 M 14 21 L 14 28',
    width: 28,
    height: 28,
    anchors: { in: { x: 14, y: 0 }, out: { x: 14, y: 0 }, earth: { x: 14, y: 28 } },
  },
  // Square, diagonal, "=" upper left and "~" lower right.
  inverter: {
    path: 'M 0 16 L 6 16 M 34 16 L 40 16 M 6 2 L 34 2 L 34 30 L 6 30 Z M 6 30 L 34 2 M 10 8 L 18 8 M 10 12 L 18 12 M 21 24 L 23.5 21 L 26 24 L 28.5 27 L 31 24',
    width: 40,
    height: 32,
    anchors: { in: { x: 0, y: 16 }, out: { x: 40, y: 16 } },
  },
  // Circle with the two opposite arrows of a bidirectional meter.
  meter: {
    path: `M 0 16 L 7 16 M 33 16 L 40 16 ${ellipse(20, 16, 13, 13)} M 13 11 L 27 11 M 24 8 L 27 11 L 24 14 M 27 21 L 13 21 M 16 18 L 13 21 L 16 24`,
    width: 40,
    height: 32,
    anchors: { in: { x: 0, y: 16 }, out: { x: 40, y: 16 } },
  },
  earth: {
    path: 'M 14 0 L 14 8 M 4 8 L 24 8 M 8 13 L 20 13 M 11 18 L 17 18',
    width: 28,
    height: 18,
    anchors: { in: { x: 14, y: 0 }, out: { x: 14, y: 0 }, earth: { x: 14, y: 18 } },
  },
  // The earth terminal bar (répartiteur de terre).
  distributionBlock: {
    path: 'M 0 4 L 28 4 L 28 12 L 0 12 Z M 6 4 L 6 0 M 14 4 L 14 0 M 22 4 L 22 0 M 14 12 L 14 16',
    width: 28,
    height: 16,
    anchors: { in: { x: 14, y: 0 }, out: { x: 28, y: 8 }, earth: { x: 14, y: 16 } },
  },
};

const BLACK = rgb(0, 0, 0);
export const SYMBOL_LINE_WIDTH = 1;

/**
 * Draws a symbol with its top-left corner at `at` (page space) and returns its anchors translated
 * to page space, so the caller joins conductors to them without knowing the symbol's geometry.
 */
export function drawSymbol(
  page: PDFPage,
  kind: SymbolKind,
  at: Point,
  options: { scale?: number; color?: RGB } = {},
): { in: Point; out: Point; earth?: Point } {
  const def = SYMBOLS[kind];
  const scale = options.scale ?? 1;
  page.drawSvgPath(def.path, { x: at.x, y: at.y, scale, borderColor: options.color ?? BLACK, borderWidth: SYMBOL_LINE_WIDTH });
  const toPage = (p: Point): Point => ({ x: at.x + p.x * scale, y: at.y - p.y * scale });
  return {
    in: toPage(def.anchors.in),
    out: toPage(def.anchors.out),
    ...(def.anchors.earth ? { earth: toPage(def.anchors.earth) } : {}),
  };
}
