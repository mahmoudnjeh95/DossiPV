/**
 * The mapping between a page's PDF user space and its space "as displayed": the page's /Rotate
 * applied, origin at the displayed bottom-left corner, y up. Text boxes are located in displayed
 * space (a list row is horizontal on screen even on a rotated page); highlights are drawn back in
 * user space. Both sides use this one mapping so they always agree.
 */

/** [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (PDF matrix convention). */
export type Matrix = [number, number, number, number, number, number];

export function multiplyMatrix(m: Matrix, n: Matrix): Matrix {
  // Apply m, then n.
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function invertMatrix(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

/**
 * User space → displayed space for a page whose visible box is `[x0, y0, x1, y1]` and whose
 * /Rotate is `rotation` (a multiple of 90, clockwise).
 */
export function userToDisplayMatrix(box: [number, number, number, number], rotation: number): Matrix {
  const [x0, y0, x1, y1] = box;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [0, -1, 1, 0, -y0, x1];
    case 180:
      return [-1, 0, 0, -1, x1, y1];
    case 270:
      return [0, 1, -1, 0, y1, -x0];
    default:
      return [1, 0, 0, 1, -x0, -y0];
  }
}
