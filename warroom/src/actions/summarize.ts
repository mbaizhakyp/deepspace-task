/**
 * Summarize the room: cards + decided polls → a dispatch ("what was decided"),
 * stored on the app-scope room record so every member sees it sync in.
 * Rate-limited to one run per room per minute (G8 — AI is developer-billed).
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { AppActionTools } from '../server/action-routes'
import { parseMemberIds } from './rooms'

type RoomData = {
  name: string
  memberIds: unknown
  facilitatorId: string
  summaryAt?: number
}
type CardData = { title?: string; body?: string; origin?: string }
type PollData = { question: string; options: unknown; status?: string }
type VoteData = { pollId: string; optionIndex: number }

export type Summary = {
  headline: string
  decisions: Array<{ title: string; detail: string }>
}

export const summarize: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const t = tools as AppActionTools
  const roomId = typeof params.roomId === 'string' ? params.roomId : ''
  const userName = typeof params.userName === 'string' ? params.userName.slice(0, 80) : 'someone'
  if (!roomId) return { success: false, error: 'roomId required' }

  const roomRes = await t.get<RoomData>('rooms', roomId)
  const room = roomRes.success ? roomRes.data?.record?.data : undefined
  if (!room) return { success: false, error: 'room not found' }
  const isMember = room.facilitatorId === userId || parseMemberIds(room.memberIds).includes(userId)
  if (!isMember) return { success: false, error: 'not a member of this room' }
  if (room.summaryAt && Date.now() - room.summaryAt < 60_000) {
    return { success: false, error: 'summary was just made — try again in a minute' }
  }

  const board = t.forRoom(`board:${roomId}`)
  const [cardsRes, pollsRes, votesRes] = await Promise.all([
    board.query<CardData>('cards', { limit: 100 }),
    board.query<PollData>('polls', { limit: 50 }),
    board.query<VoteData>('votes', { limit: 500 }),
  ])
  const cards = cardsRes.success ? (cardsRes.data?.records ?? []) : []
  const polls = pollsRes.success ? (pollsRes.data?.records ?? []) : []
  const votes = votesRes.success ? (votesRes.data?.records ?? []) : []
  if (cards.length === 0 && polls.length === 0) {
    return { success: false, error: 'nothing on the board to summarize' }
  }

  const pollLines = polls.map((p) => {
    const opts = parseOptions(p.data.options)
    const counts = opts.map(
      (_, i) => votes.filter((v) => v.data.pollId === p.recordId && v.data.optionIndex === i).length,
    )
    const winner = counts.indexOf(Math.max(...counts))
    return `POLL: "${p.data.question}" — ${p.data.status === 'closed' ? `DECIDED: "${opts[winner]}" (${counts.join('–')})` : `still open (${counts.join('–')})`}`
  })
  const cardLines = cards.map((c) => `CARD: ${c.data.title ?? ''} — ${c.data.body ?? ''}`)

  const ai = await t.integration<{ content?: Array<{ type: string; text?: string }> }>(
    'anthropic/chat-completion',
    {
      max_tokens: 2048,
      system:
        'You write the dispatch of a working meeting from its board. Respond with ONLY JSON: ' +
        '{"headline": "one factual sentence on what this room settled", "decisions": [{"title": "...", "detail": "..."}]}. ' +
        '3-8 decisions. Titles are outcomes stated as facts ("Ship date holds at Oct 20"), details are one sentence of evidence — cite poll results with their vote counts when present. No prose outside the JSON.',
      messages: [
        { role: 'user', content: `Room: ${room.name}\n\n${pollLines.join('\n')}\n\n${cardLines.join('\n')}`.slice(0, 40_000) },
      ],
    },
  )
  if (!ai.success) return { success: false, error: ai.error ?? 'AI call failed' }

  const raw = (ai.data?.content ?? []).map((b) => (b.type === 'text' ? (b.text ?? '') : '')).join('')
  const summary = parseSummary(raw)
  if (!summary) return { success: false, error: 'summary came back malformed — try again' }

  await t.update('rooms', roomId, { summary, summaryAt: Date.now() })
  await board.create('events', {
    at: Date.now(),
    text: `SUMMARY REQUESTED · ${userName.toUpperCase()}`,
  })
  return { success: true, data: { summary } }
}

function parseOptions(raw: unknown): string[] {
  const v = typeof raw === 'string' ? safeJson(raw) : raw
  return Array.isArray(v) ? v.filter((o): o is string => typeof o === 'string') : []
}

export function parseSummary(raw: string): Summary | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  const parsed = safeJson(trimmed.slice(start, end + 1))
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  if (typeof o.headline !== 'string' || !Array.isArray(o.decisions)) return null
  const decisions = o.decisions.filter(
    (d): d is { title: string; detail: string } =>
      !!d && typeof d === 'object' &&
      typeof (d as Record<string, unknown>).title === 'string' &&
      typeof (d as Record<string, unknown>).detail === 'string',
  )
  return { headline: o.headline, decisions }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
