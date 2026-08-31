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
  onPointerDown,
  dragPos,
}: {
  pollId: string
  data: PollData
  isFacilitator: boolean
  locked: boolean
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
      className={`card-drop absolute z-10 w-80 rounded-sm bg-paper p-4 shadow-[0_2px_6px_rgba(26,26,22,.35)] ${dragPos ? 'z-30' : ''}`}
      style={{ left: x, top: y }}
    >
      <div
        className={`wire text-[10px] text-ink-muted ${locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={onPointerDown}
      >
        {closed
          ? `DECIDED${data.closedAt ? ' ' + formatTime(data.closedAt) : ''} · ${total} VOTED`
          : `LIVE POLL${data.authorName ? ' · ' + data.authorName.toUpperCase() : ''}`}
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
          {closed
            ? `RESULT · ${(options[winner] ?? '').toUpperCase()} · ${counts.join('–')}`
            : myVote
              ? `YOU VOTED · ${total} VOTED`
              : `${total} VOTED`}
        </span>
        {!closed && isFacilitator && (
          <button onClick={closePoll} className="wire text-signal hover:underline">
            CLOSE
          </button>
        )}
      </div>
    </div>
  )
}

function formatTime(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
