/**
 * Audit writer — one privileged, fire-and-forget path into the app-scope
 * `audit` collection. Never throws (a broken logger must not break the app)
 * and never stores payload bodies: strings are truncated hard so imported
 * document text and other user content stay out of the trail.
 */

import type { Env } from '../../worker'
import { roomTools } from './room-tools'

export type AuditEntry = {
  kind: 'action' | 'job' | 'error'
  name: string
  userId?: string
  userName?: string
  roomId?: string
  ok?: boolean
  detail?: unknown
}

export async function writeAudit(env: Env, entry: AuditEntry): Promise<void> {
  try {
    const app = roomTools(env, `app:${env.DEEPSPACE_APP_ID}`, env.OWNER_USER_ID)
    const res = await app.create('audit', {
      at: Date.now(),
      kind: entry.kind,
      name: entry.name.slice(0, 80),
      userId: entry.userId ?? '',
      userName: (entry.userName ?? '').slice(0, 80),
      roomId: entry.roomId ?? '',
      ok: entry.ok === false ? 0 : 1,
      detail: serializeDetail(entry.detail),
    })
    if (!res.success) {
      console.error(`[audit] create rejected for ${entry.kind}:${entry.name}: ${res.error}`)
    }
  } catch (err) {
    // last resort: at least reach `deepspace logs`
    console.error(`[audit] write failed for ${entry.kind}:${entry.name}:`, err)
  }
}

/** Truncate every string deep in the detail so content never lands in the trail. */
export function summarize(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > 120 ? `${value.slice(0, 120)}… (${value.length} chars)` : value
  }
  if (Array.isArray(value)) {
    return depth > 2 ? `[array ${value.length}]` : value.slice(0, 10).map((v) => summarize(v, depth + 1))
  }
  if (value && typeof value === 'object') {
    if (depth > 2) return '[object]'
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value).slice(0, 20)) out[k] = summarize(v, depth + 1)
    return out
  }
  return value
}

function serializeDetail(detail: unknown): string {
  if (detail === undefined) return ''
  try {
    return JSON.stringify(summarize(detail)).slice(0, 2000)
  } catch {
    return String(detail).slice(0, 2000)
  }
}
