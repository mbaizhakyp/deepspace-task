/**
 * Lobby — your rooms. The rooms query is scoped server-side by
 * `read: 'collaborator'`, so this lists only rooms whose memberIds
 * include the caller. Creation goes through the create-room action.
 */

import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthUser, useQuery, useUsers } from 'deepspace'
import { Button, Input, useToast } from '@/components/ui'
import { callAction } from '../../../lib/actions-client'

type Room = { name: string; facilitatorId: string; memberIds?: unknown }

export default function RoomsPage() {
  const { user } = useAuthUser()
  const { records: rooms, status } = useQuery<Room>('rooms', { orderBy: 'createdAt', orderDir: 'desc' })
  // roster (public identity) — lets rows say WHOSE room it is; two rooms may
  // legitimately share a name (B-005), so name alone must never be the label
  const { users: roster } = useUsers()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const createGuard = useRef(false)
  const navigate = useNavigate()
  const { error } = useToast()

  async function create() {
    // ref guard: two clicks (or Enter+click) in the same tick both see the
    // stale `creating` state — the ref flips synchronously (B-005 defense)
    if (!name.trim() || creating || createGuard.current) return
    createGuard.current = true
    setCreating(true)
    const res = await callAction<{ roomId: string }>('create-room', {
      name,
      userName: user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'facilitator',
    })
    setCreating(false)
    createGuard.current = false
    if (res.success && res.data?.roomId) navigate(`/room/${res.data.roomId}`)
    else error('Could not open the room', res.error)
  }

  async function deleteRoom(roomId: string, roomName: string) {
    // native confirm: destructive, one line, no dialog plumbing
    if (!window.confirm(`Delete "${roomName}"? The board, its polls, and its history go with it.`)) return
    const res = await callAction('delete-room', { roomId })
    if (!res.success) error('Could not delete the room', res.error)
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="wire text-chrome">LOBBY</div>
      <h1 className="mt-1 font-serif text-4xl text-foreground">Your rooms</h1>

      <div className="mt-8 flex gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Name a room — 'Q3 launch plan'"
          className="flex-1"
        />
        <Button onClick={create} disabled={creating || !name.trim()}>
          Open a room
        </Button>
      </div>

      <div className="mt-10 flex flex-col gap-2">
        {status === 'ready' && rooms.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Open a room, or ask someone for their room link.
          </p>
        )}
        {rooms.map((r) => {
          const mine = r.data.facilitatorId === user?.id
          const facilitatorName = roster.find((u) => u.id === r.data.facilitatorId)?.name
          const whose = mine ? 'YOUR ROOM' : `${(facilitatorName ?? 'UNKNOWN').toUpperCase()}'S ROOM`
          const opened = new Date(r.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
          return (
            <div
              key={r.recordId}
              className="group flex items-baseline gap-4 rounded-sm border border-border bg-card px-5 py-4 hover:border-chrome"
            >
              <button
                onClick={() => navigate(`/room/${r.recordId}`)}
                className="flex flex-1 items-baseline justify-between gap-4 text-left"
              >
                <span className="flex items-baseline gap-3">
                  <span className="font-serif text-xl text-foreground">{r.data.name}</span>
                  <span className="wire text-[10px] text-chrome/70">
                    {whose} · {opened.toUpperCase()}
                  </span>
                </span>
                <span className="wire text-chrome">{mine ? 'FACILITATOR' : 'MEMBER'}</span>
              </button>
              {mine && (
                <button
                  onClick={() => deleteRoom(r.recordId, r.data.name)}
                  className="wire hidden text-chrome hover:text-destructive group-hover:inline"
                  aria-label={`Delete ${r.data.name}`}
                >
                  DELETE
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
