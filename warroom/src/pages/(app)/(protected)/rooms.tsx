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
import { parseMemberIds } from '../../../actions/rooms'

type Room = { name: string; facilitatorId: string; memberIds?: unknown }

/** Accepts a full room URL or a bare room code (the id in the link). */
export function parseRoomCode(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const fromUrl = s.match(/\/room\/([A-Za-z0-9_-]+)/)
  if (fromUrl) return fromUrl[1]
  return /^[A-Za-z0-9_-]{6,}$/.test(s) ? s : null
}

export default function RoomsPage() {
  const { user } = useAuthUser()
  const { records: allRooms, status } = useQuery<Room>('rooms', { orderBy: 'createdAt', orderDir: 'desc' })
  // `read: 'collaborator'` scopes this server-side for members — but the app
  // OWNER's admin role legitimately reads every room, which made the owner's
  // lobby list everyone's rooms. The lobby is "your rooms", so filter here
  // too; admin oversight lives in /audit, not the lobby.
  const rooms = allRooms.filter(
    (r) =>
      r.data.facilitatorId === user?.id || parseMemberIds(r.data.memberIds).includes(user?.id ?? ''),
  )
  // roster (public identity) — lets rows say WHOSE room it is; two rooms may
  // legitimately share a name (B-005), so name alone must never be the label
  const { users: roster } = useUsers()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [joinCode, setJoinCode] = useState('')
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

  function joinByCode() {
    const id = parseRoomCode(joinCode)
    if (id) navigate(`/room/${id}`)
  }

  // No popups (user preference): destructive room delete uses an inline
  // two-step — first click arms the button ("SURE?"), second click deletes,
  // and it disarms itself after a beat.
  const [armedDelete, setArmedDelete] = useState<string | null>(null)

  async function deleteRoom(roomId: string) {
    if (armedDelete !== roomId) {
      setArmedDelete(roomId)
      setTimeout(() => setArmedDelete((cur) => (cur === roomId ? null : cur)), 2500)
      return
    }
    setArmedDelete(null)
    const res = await callAction('delete-room', { roomId })
    if (!res.success) error('Could not delete the room', res.error)
  }

  // one intent at a time (user feedback): the lobby leads with two buttons;
  // the matching field appears only once you've picked an intent
  const [intent, setIntent] = useState<'none' | 'create' | 'join'>('none')

  const today = new Date()
    .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    .toUpperCase()

  return (
    <div className="dotgrid min-h-full">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* masthead — the lobby reads like a front page */}
        <div className="border-y-2 border-foreground/70 py-1">
          <div className="wire flex items-baseline justify-between border-b border-border pb-1 text-[10px] text-chrome">
            <span>{today}</span>
            <span>DECISIONS DAILY</span>
            <span>FREE EDITION · 3 IMPORTS PER ROOM</span>
          </div>
          <h1 className="py-3 text-center font-serif text-6xl tracking-tight text-foreground">
            The Warroom
          </h1>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={() => setIntent(intent === 'create' ? 'none' : 'create')}
            className={`wire flex-1 rounded-sm border px-4 py-3.5 ${intent === 'create' ? 'border-primary text-primary' : 'border-border text-chrome hover:border-chrome hover:text-foreground'}`}
          >
            + NEW ROOM
          </button>
          <button
            onClick={() => setIntent(intent === 'join' ? 'none' : 'join')}
            className={`wire flex-1 rounded-sm border px-4 py-3.5 ${intent === 'join' ? 'border-primary text-primary' : 'border-border text-chrome hover:border-chrome hover:text-foreground'}`}
          >
            → JOIN BY LINK
          </button>
        </div>

        {intent === 'create' && (
          <div className="mt-3 flex gap-3">
            <Input
              autoFocus
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
        )}

        {intent === 'join' && (
          <div className="mt-3 flex gap-3">
            <Input
              autoFocus
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
              placeholder="Paste the room link or code you were sent"
              className="flex-1"
            />
            <button
              onClick={joinByCode}
              disabled={!parseRoomCode(joinCode)}
              className="wire rounded-sm border border-border px-4 text-chrome hover:border-chrome hover:text-foreground disabled:opacity-40"
            >
              JOIN
            </button>
          </div>
        )}

        <div className="wire mt-10 border-b border-border pb-1 text-[10px] text-chrome">
          YOUR ROOMS
        </div>
        <div className="mt-3 flex flex-col gap-2">
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
                  onClick={() => deleteRoom(r.recordId)}
                  className={`wire group-hover:inline ${
                    armedDelete === r.recordId
                      ? 'inline text-destructive'
                      : 'hidden text-chrome hover:text-destructive'
                  }`}
                  aria-label={`Delete ${r.data.name}`}
                >
                  {armedDelete === r.recordId ? 'SURE?' : 'DELETE'}
                </button>
              )}
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
