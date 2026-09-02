/**
 * Live poll — a paper artifact on the board. One vote per user is enforced
 * twice: `uniqueOn ['pollId','voterId']` at the database (a second create is
 * refused) and revote-by-update guarded by `update: 'own'`. voterId is
 * userBound, so a forged voterId never lands.
 */

import { useState } from 'react'
import { useAuthUser, useMutations, useQuery } from 'deepspace'
import { useToast } from '@/components/ui'

export type PollData = {
  question: string
  options: unknown
  status?: string
  x?: number
  y?: number
  authorName?: string
  closedAt?: number | null
}
export type VoteData = { pollId: string; voterId: string; optionIndex: number; voterName?: string }

export function parseOptions(raw: unknown): string[] {
  const v = typeof raw === 'string' ? safeJson(raw) : raw
  return Array.isArray(v) ? v.filter((o): o is string => typeof o === 'string') : []
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export function PollCard({
  pollId,
  data,
  isFacilitator,
  locked,
  memberCount,
  selected,
  canDelete,
  onDelete,
  onPointerDown,
  dragPos,
}: {
  pollId: string
  data: PollData
  isFacilitator: boolean
  locked: boolean
  memberCount: number
  selected: boolean
  canDelete: boolean
  onDelete: () => void
  onPointerDown: (e: React.PointerEvent) => void
  dragPos: { x: number; y: number } | null
}) {
  const { user } = useAuthUser()
  const { records: votes } = useQuery<VoteData>('votes', { where: { pollId } })
  const voteMutations = useMutations<VoteData>('votes')
  const pollMutations = useMutations<PollData>('polls')
  const eventMutations = useMutations<{ at: number; text: string }>('events')
  const { warning } = useToast()

  const options = parseOptions(data.options)
  const closed = data.status === 'closed'
  const myVote = votes.find((v) => v.data.voterId === user?.id)
  const counts = options.map((_, i) => votes.filter((v) => v.data.optionIndex === i).length)
  const total = votes.length
  const max = Math.max(1, ...counts)
  const winner = closed ? counts.indexOf(Math.max(...counts)) : -1
  // everyone in = the poll is ripe (round 14): the card says so in green
  const allVoted = !closed && memberCount > 0 && total >= memberCount

  async function vote(optionIndex: number) {
    if (closed || locked || !voteMutations.ready) return
    try {
      if (myVote) await voteMutations.put(myVote.recordId, { optionIndex })
      else
        await voteMutations.create({
          pollId,
          voterId: user?.id ?? '',
          optionIndex,
          voterName: user?.fullName ?? '',
        })
    } catch (e) {
      warning('Vote failed', e instanceof Error ? e.message : undefined)
    }
  }

  async function closePoll() {
    await pollMutations.put(pollId, { status: 'closed', closedAt: Date.now() })
    await eventMutations.create({
      at: Date.now(),
      text: `POLL DECIDED · ${(options[counts.indexOf(Math.max(...counts))] ?? '').toUpperCase()} · ${counts.join('–')}`,
    })
  }

  const x = dragPos?.x ?? data.x ?? 400
  const y = dragPos?.y ?? data.y ?? 200

  return (
    <div
      className={`card-drop absolute z-10 w-80 rounded-sm bg-paper p-4 shadow-[0_2px_6px_rgba(26,26,22,.35)] ${selected ? 'ring-2 ring-primary/60' : allVoted ? 'ring-2 ring-[#15803d]/50' : ''} ${dragPos ? 'z-30' : ''}`}
      style={{ left: x, top: y }}
    >
      <div
        className={`wire text-[10px] text-ink-muted ${locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={onPointerDown}
      >
        {closed ? (
          `DECIDED${data.closedAt ? ' ' + formatTime(data.closedAt) : ''} · ${total} VOTED`
        ) : allVoted ? (
          <span className="font-medium text-[#15803d]">
            EVERYONE VOTED · {total}/{memberCount} — READY TO DECIDE
          </span>
        ) : (
          `LIVE POLL${data.authorName ? ' · ' + data.authorName.toUpperCase() : ''}`
        )}
      </div>
      <div className="mt-1.5 font-serif text-xl leading-snug text-ink">{data.question}</div>

      <div className="mt-3.5 flex flex-col gap-2.5">
        {options.map((opt, i) => {
          const isWinner = i === winner
          const isMine = myVote?.data.optionIndex === i
          return (
            <button
              key={i}
              onClick={() => vote(i)}
              disabled={closed || locked}
              className="group block w-full text-left disabled:cursor-default"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`text-[13px] ${isMine || isWinner ? 'font-semibold text-ink' : closed ? 'text-ink-muted' : 'text-ink group-hover:font-medium'}`}
                >
                  {opt}
                  {isMine && <span className="text-signal"> ✓</span>}
                </span>
                <span className="wire text-[10px] text-ink-muted">{counts[i]}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-[2px] bg-ink/10">
                <div
                  className={`fillbar h-1.5 rounded-[2px] ${closed && !isWinner ? 'bg-ink-muted/50' : 'bg-signal'}`}
                  style={{ width: `${(counts[i] / max) * 100}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>

      <div className="wire mt-3.5 flex items-center justify-between text-[10px] text-ink-muted">
        <span>
          {closed ? (
            `RESULT · ${(options[winner] ?? '').toUpperCase()} · ${counts.join('–')}`
          ) : allVoted ? (
            <span className="text-[#15803d]">{total}/{memberCount} IN</span>
          ) : myVote ? (
            `YOU VOTED · ${total}/${memberCount} VOTED`
          ) : (
            `${total}/${memberCount} VOTED`
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {canDelete && (
            <button
              onClick={onDelete}
              title="Delete this poll"
              aria-label="Delete this poll"
              className="rounded-[2px] border border-destructive/30 p-1.5 text-destructive/80 hover:border-destructive hover:text-destructive"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden>
                <path d="M2 3.5h10M5.5 3.5V2.3a.6.6 0 01.6-.6h1.8a.6.6 0 01.6.6v1.2" />
                <path d="M3.5 3.5l.55 8a1 1 0 001 .9h3.9a1 1 0 001-.9l.55-8M5.8 6.2v3.8M8.2 6.2v3.8" />
              </svg>
            </button>
          )}
          {!closed && isFacilitator && (
            <button
              onClick={closePoll}
              className="wire rounded-[2px] border border-signal/40 px-2 py-1 text-signal hover:border-signal"
            >
              CLOSE
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

function formatTime(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
