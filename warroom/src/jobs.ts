/**
 * Background jobs. `import-text` turns pasted document text into board
 * cards with AI segmentation, streaming progress to everyone in the room
 * (useJobs subscribes over the board's job room).
 *
 * Authorization happens HERE, not at enqueue: any board member's client can
 * enqueue over WS, so the handler re-derives identity from `job.enqueuedBy`
 * (stamped by the room from the verified socket identity) and checks
 * membership + the free-import quota against the app-scope room record
 * before touching anything. payload.roomId is claimed by the client and is
 * only acted on after that check.
 */

import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { ownerIntegration, roomTools } from './server/room-tools'
import { writeAudit } from './server/audit'
import { parseMemberIds } from './actions/rooms'

export const FREE_IMPORT_LIMIT = 3

type ImportPayload = {
  roomId: string
  text: string
  mode: 'cards' | 'key-points'
  userName?: string
}

type RoomData = {
  name: string
  memberIds: unknown
  facilitatorId: string
  importCount?: number
}

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  try {
    const result = await dispatch(job, ctx, env)
    await writeAudit(env, {
      kind: 'job',
      name: job.type,
      userId: job.enqueuedBy?.replace(/^verified:/, '') ?? '',
      roomId: (job.payload as { roomId?: string } | undefined)?.roomId,
      ok: true,
      detail: { result },
    })
    return result
  } catch (err) {
    await writeAudit(env, {
      kind: 'error',
      name: job.type,
      userId: job.enqueuedBy?.replace(/^verified:/, '') ?? '',
      roomId: (job.payload as { roomId?: string } | undefined)?.roomId,
      ok: false,
      detail: { thrown: err instanceof Error ? err.message : String(err) },
    })
    throw err
  }
}

async function dispatch(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  switch (job.type) {
    case 'import-text':
      return importText(job, ctx, env)
    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}

async function importText(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  const { roomId, text, mode, userName } = (job.payload ?? {}) as ImportPayload
  // `verified:` marks an enqueue from the start-import action, which already
  // checked quota + subscription tier. Only server code can set enqueuedBy —
  // WS enqueues get the socket's plain userId stamped by the room.
  const verified = job.enqueuedBy?.startsWith('verified:') ?? false
  const userId = verified ? job.enqueuedBy!.slice('verified:'.length) : job.enqueuedBy
  if (!userId || !roomId || typeof text !== 'string' || !text.trim()) {
    throw new Error('invalid import request')
  }

  ctx.progress(0.05, 'CHECKING ACCESS')
  const app = roomTools(env, `app:${env.DEEPSPACE_APP_ID}`, env.OWNER_USER_ID)
  const roomRes = await app.get<RoomData>('rooms', roomId)
  const room = roomRes.success ? roomRes.data?.record?.data : undefined
  if (!room) throw new Error('room not found')
  const isMember =
    room.facilitatorId === userId || parseMemberIds(room.memberIds).includes(userId)
  if (!isMember) throw new Error('not a member of this room')

  const used = room.importCount ?? 0
  // ponytail: quota is per-room, not per-user — a room's members share 3 free
  // imports. The start-import action lifts it for entitled Pro users (its
  // `verified:` marker); a raw WS enqueue only ever gets the free quota.
  if (!verified && used >= FREE_IMPORT_LIMIT) {
    throw new Error(`free import limit reached (${FREE_IMPORT_LIMIT}) — Pro removes it`)
  }
  await app.update('rooms', roomId, { importCount: used + 1 })

  const board = roomTools(env, `board:${roomId}`, userId)
  await board.create('events', {
    at: Date.now(),
    text: `${(userName ?? 'someone').toUpperCase()} STARTED AN IMPORT`,
  })

  ctx.progress(0.15, 'READING THE DOCUMENT')
  const cards = await segment(env, text, mode)
  if (ctx.signal.aborted) return { created: 0, canceled: true }
  if (cards.length === 0) throw new Error('the document produced no cards')

  // B-011: a second import used to land on the same fixed grid as the first,
  // stacking batches on top of each other. Start this batch's grid below
  // everything already on the board.
  const existing = await board.query<{ y?: number }>('cards', { limit: 500 })
  const rows = existing.data?.records ?? []
  const baseY = rows.length ? Math.max(...rows.map((r) => Number(r.data.y) || 0)) + 260 : 80
  const bbox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }

  let created = 0
  for (let i = 0; i < cards.length; i++) {
    if (ctx.signal.aborted) break
    const card = cards[i]
    const x = 60 + (i % 4) * 300
    const y = baseY + Math.floor(i / 4) * 190
    bbox.x0 = Math.min(bbox.x0, x)
    bbox.y0 = Math.min(bbox.y0, y)
    bbox.x1 = Math.max(bbox.x1, x + 280)
    bbox.y1 = Math.max(bbox.y1, y + 190)
    await board.create('cards', {
      title: card.title.slice(0, 120),
      body: card.body.slice(0, 1200),
      x,
      y,
      origin: 'imported',
      authorName: userName ?? '',
      tint: used % 4, // batch color: each import lands on its own paper stock
    })
    created++
    ctx.progress(
      0.2 + 0.75 * ((i + 1) / cards.length),
      `CARD ${i + 1}/${cards.length} · ${card.title.toUpperCase().slice(0, 32)}`,
    )
  }

  await board.create('events', {
    at: Date.now(),
    text: `IMPORT LANDED · ${created} CARDS`,
  })
  ctx.progress(1, `DONE · ${created} CARDS`)
  // bbox lets clients center their camera on THIS batch, not all imports ever
  return { created, bbox: created > 0 ? [bbox.x0, bbox.y0, bbox.x1, bbox.y1] : undefined }
}

/** A promise with a deadline — hung upstream calls become clean failures. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s — try again`)), ms),
    ),
  ])
}

/**
 * AI segmentation (D-004): split by IDEA, not by headings — headings are a
 * hint. 'cards' mode maps the whole document; 'key-points' distills only
 * what is worth discussing.
 */
async function segment(
  env: Env,
  text: string,
  mode: 'cards' | 'key-points',
): Promise<Array<{ title: string; body: string }>> {
  const instruction =
    mode === 'key-points'
      ? 'Extract only the points worth discussing in a meeting: decisions to make, open questions, risks, action items. 4-12 cards.'
      : 'Break the ENTIRE document into cards, one coherent idea per card. Use headings as hints when present, but segment by meaning — unstructured text gets segmented by topic shifts. 4-24 cards.'

  // B-019: an AI call that hangs left the job 'running' forever — the panel
  // showed "Import in progress" for eternity. A hung call now FAILS the job
  // (maxAttempts 1 → status 'failed'), which the panel reports honestly.
  const res = await withTimeout(
    ownerIntegration<{ content?: Array<{ type: string; text?: string }> }>(
    env,
    'anthropic/chat-completion',
    {
      max_tokens: 4096,
      system:
        `You turn documents into discussion cards for a collaborative board. ${instruction} ` +
        'Each card: a short punchy title (2-6 words) and a body of 1-3 sentences in the document\'s own substance (not meta-commentary). ' +
        'Respond with ONLY a JSON array: [{"title": "...", "body": "..."}]. No prose, no code fences.',
      messages: [{ role: 'user', content: text.slice(0, 60_000) }],
    },
    ),
    120_000,
    'AI segmentation',
  )
  if (!res.success) throw new Error(res.error ?? res.message ?? 'AI call failed')

  const raw = (res.data?.content ?? [])
    .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
    .join('')
  const parsed = extractJsonArray(raw)
  return parsed
    .filter(
      (c): c is { title: string; body: string } =>
        !!c && typeof c === 'object' && typeof (c as Record<string, unknown>).title === 'string' &&
        typeof (c as Record<string, unknown>).body === 'string',
    )
    .slice(0, 24)
}

export function extractJsonArray(raw: string): unknown[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
