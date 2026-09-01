/**
 * Board camera — pure math for pan/zoom (D-022, unbounded per D-024). The
 * view is LOCAL state: each person frames the board for themselves; card
 * positions stay in world coordinates in the records, so views never fight.
 * The canvas is unlimited — RESET (fit-all) is the way home, not clamps.
 */

export type View = { x: number; y: number; scale: number }

export const MIN_SCALE = 0.2
export const MAX_SCALE = 1.5

/** Zoom by `factor` keeping the world point under viewport point (px,py) fixed. */
export function zoomView(v: View, px: number, py: number, factor: number): View {
  const scale = Math.min(Math.max(v.scale * factor, MIN_SCALE), MAX_SCALE)
  const k = scale / v.scale
  return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, scale }
}

/** View that fits the world rect [x0,y0]-[x1,y1] centered in the viewport. */
export function fitView(x0: number, y0: number, x1: number, y1: number, viewportW: number, viewportH: number, pad = 80): View {
  const w = Math.max(x1 - x0, 1)
  const h = Math.max(y1 - y0, 1)
  const scale = Math.min(
    Math.max(Math.min((viewportW - pad * 2) / w, (viewportH - pad * 2) / h, 1), MIN_SCALE),
    MAX_SCALE,
  )
  return {
    scale,
    x: viewportW / 2 - (x0 + w / 2) * scale,
    y: viewportH / 2 - (y0 + h / 2) * scale,
  }
}

/** Viewport (screen) point → world point. */
export function toWorld(v: View, px: number, py: number): { wx: number; wy: number } {
  return { wx: (px - v.x) / v.scale, wy: (py - v.y) / v.scale }
}

/**
 * Dot-grid spacing for a zoom level: halve the density (double the spacing)
 * until dots are ≥12px apart, so zooming far out subdivides instead of
 * turning the ground to noise.
 */
export function gridSpacing(scale: number, base = 24): number {
  let s = base * scale
  while (s < 12) s *= 2
  return s
}
