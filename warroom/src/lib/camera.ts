/**
 * Board camera — pure math for pan/zoom (D-022). The view is LOCAL state:
 * each person frames the board for themselves; card positions stay in world
 * coordinates in the records, so views never fight.
 */

export type View = { x: number; y: number; scale: number }

export const MIN_SCALE = 0.35
export const MAX_SCALE = 1.5

/** Keep at least `margin` px of the world rect visible in the viewport. */
export function clampView(v: View, viewportW: number, viewportH: number, worldW: number, worldH: number, margin = 160): View {
  return {
    ...v,
    x: Math.min(Math.max(v.x, margin - worldW * v.scale), viewportW - margin),
    y: Math.min(Math.max(v.y, margin - worldH * v.scale), viewportH - margin),
  }
}

/** Zoom by `factor` keeping the world point under viewport point (px,py) fixed. */
export function zoomView(v: View, px: number, py: number, factor: number): View {
  const scale = Math.min(Math.max(v.scale * factor, MIN_SCALE), MAX_SCALE)
  const k = scale / v.scale
  return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, scale }
}

/** Viewport (screen) point → world point. */
export function toWorld(v: View, px: number, py: number): { wx: number; wy: number } {
  return { wx: (px - v.x) / v.scale, wy: (py - v.y) / v.scale }
}
