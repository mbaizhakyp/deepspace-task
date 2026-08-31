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
  switch (job.type) {
    case 'import-text':
      return importText(job, ctx, env)
    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}

async function importText(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  const { roomId, text, mode, userName } = (job.payload ?? {}) as ImportPayload
  const userId = job.enqueuedBy
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
  // imports; per-user metering when payments demand it (stage 9 gates Pro here)
  if (used >= FREE_IMPORT_LIMIT) {
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

  let created = 0
  for (let i = 0; i < cards.length; i++) {
    if (ctx.signal.aborted) break
    const card = cards[i]
    await board.create('cards', {
      title: card.title.slice(0, 120),
      body: card.body.slice(0, 1200),
      x: 60 + (i % 4) * 300,
      y: 80 + Math.floor(i / 4) * 190,
      origin: 'imported',
      authorName: userName ?? '',
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
  return { created }
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

  const res = await ownerIntegration<{ content?: Array<{ type: string; text?: string }> }>(
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

function extractJsonArray(raw: string): unknown[] {
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
