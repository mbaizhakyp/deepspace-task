/**
 * A war room. Joins on entry (idempotent), then mounts the board's own
 * record scope — cards/polls/votes/events sync through `board:<id>`,
 * while this outer component still sees the app scope (rooms registry).
 */

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RecordScope, useAuthUser, useQuery } from 'deepspace'
import { boardSchemas } from '../../../../schemas'
import { callAction } from '../../../../lib/actions-client'
import Board from '../../../../components/Board'

import type { Summary } from '../../../../actions/summarize'

type Room = {
  name: string
  facilitatorId: string
  summary?: unknown
  summaryAt?: number | null
}

function parseSummary(raw: unknown): Summary | null {
  const v = typeof raw === 'string' ? safeJson(raw) : raw
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  return typeof o.headline === 'string' && Array.isArray(o.decisions) ? (o as Summary) : null
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export default function RoomPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthUser()
  const [joinState, setJoinState] = useState<'joining' | 'ok' | 'failed'>('joining')

  useEffect(() => {
    if (!id || !user) return
    let cancelled = false
    callAction('join-room', {
      roomId: id,
      userName: user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'someone',
    }).then(
      (res) => {
        if (!cancelled) setJoinState(res.success ? 'ok' : 'failed')
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, user?.id])

  const { records: rooms } = useQuery<Room>('rooms', {})
  const room = rooms.find((r) => r.recordId === id)

  if (!id) return null
  if (joinState === 'failed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="wire text-chrome">ROOM NOT FOUND</div>
        <Link to="/rooms" className="text-sm text-primary">
          Back to the lobby
        </Link>
      </div>
    )
  }
  if (joinState === 'joining' || !room) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="wire text-chrome breathe">CONNECTING</div>
      </div>
    )
  }

  return (
    <RecordScope roomId={`board:${id}`} schemas={boardSchemas}>
      <Board
        roomId={id}
        roomName={room.data.name}
        facilitatorId={room.data.facilitatorId}
        summary={parseSummary(room.data.summary)}
        summaryAt={room.data.summaryAt ?? null}
      />
    </RecordScope>
  )
}
