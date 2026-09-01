/**
 * Join-input parsing (D-039): the lobby's join field takes a full room URL,
 * a bare record id, or a 6-char room code (optionally "WR-" prefixed, as
 * it's displayed). Codes use an unambiguous alphabet — no I/L/O/0/1.
 */

export function parseJoinInput(raw: string): { roomId: string } | { code: string } | null {
  const s = raw.trim()
  if (!s) return null
  const fromUrl = s.match(/\/room\/([A-Za-z0-9_-]+)/)
  if (fromUrl) return { roomId: fromUrl[1] }
  const code = s.toUpperCase().replace(/^WR-?/, '')
  if (/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return { code }
  // an explicit WR- prefix means "this is a code" — never fall back to id
  if (/^WR-?/i.test(s)) return null
  return /^[A-Za-z0-9_-]{8,}$/.test(s) ? { roomId: s } : null
}
