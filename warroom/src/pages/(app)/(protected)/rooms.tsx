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
import { parseJoinInput } from '../../../lib/join-code'
import { leftRooms } from '../../../lib/left-rooms'
import { TourOffer } from '../../../components/Tour'

const LOBBY_TOUR = [
  { anchor: 'nav', title: 'THE DESK', body: 'Rooms is your lobby, Pricing the plans, Settings your account. The wire clock is always on.' },
  { anchor: 'theme', title: 'DAY / NIGHT', body: 'Flip between the night desk and the day edition any time — your cards stay paper either way.' },
  { anchor: 'new-room', title: 'START HERE', body: 'Open a room and name the decision — "Q3 launch plan". You become its facilitator.' },
  { anchor: 'join', title: 'INVITED?', body: 'Paste the room link or type a WR- code here. Opening a link also joins you automatically.' },
]

type Room = { name: string; facilitatorId: string; memberIds?: unknown }

export default function RoomsPage() {
  const { user } = useAuthUser()
  const { records: allRooms, status } = useQuery<Room>('rooms', { orderBy: 'createdAt', orderDir: 'desc' })
  // `read: 'collaborator'` scopes this server-side for members — but the app
  // OWNER's admin role legitimately reads every room, which made the owner's
  // lobby list everyone's rooms. The lobby is "your rooms", so filter here
  // too; admin oversight lives in /audit, not the lobby.
  const rooms = allRooms.filter(
    (r) =>
      !leftRooms.has(r.recordId) && // B-015: our own leave can't sync back to us
      (r.data.facilitatorId === user?.id ||
        parseMemberIds(r.data.memberIds).includes(user?.id ?? '')),
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
    else if (res.error === 'upgrade_required')
      error('Free tier is 3 rooms', 'Pro removes the limit — see Pricing. Or delete a room you no longer need.')
    else error('Could not open the room', res.error)
  }

  const [joining, setJoining] = useState(false)
  async function joinByCode() {
    const parsed = parseJoinInput(joinCode)
    if (!parsed || joining) return
    if ('roomId' in parsed) return navigate(`/room/${parsed.roomId}`)
    // short code: the join-room action resolves it server-side (the registry
    // isn't readable by non-members) and joins in the same call
    setJoining(true)
    const res = await callAction<{ roomId?: string }>('join-room', {
      code: parsed.code,
      userName: user?.fullName ?? '',
    })
    setJoining(false)
    if (res.success && res.data?.roomId) navigate(`/room/${res.data.roomId}`)
    else error('Could not join', res.error ?? 'no room with that code')
  }

  // members can leave a room straight from the lobby (same two-step arm)
  async function leaveRow(roomId: string) {
    if (armedDelete !== roomId) {
      setArmedDelete(roomId)
      setTimeout(() => setArmedDelete((cur) => (cur === roomId ? null : cur)), 2500)
      return
    }
    setArmedDelete(null)
    const res = await callAction('leave-room', { roomId, userName: user?.fullName ?? '' })
    if (res.success) {
      leftRooms.add(roomId) // hide it now; sync can't (B-015)
      setLeftTick((t) => t + 1) // module Set doesn't re-render on its own
    } else error('Could not leave', res.error)
  }
  const [, setLeftTick] = useState(0)

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
            <span>FREE EDITION · 3 ROOMS · 3 IMPORTS EACH</span>
          </div>
          <h1 className="py-3 text-center font-serif text-6xl tracking-tight text-foreground">
            The Warroom
          </h1>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            data-tour="new-room"
            onClick={() => setIntent(intent === 'create' ? 'none' : 'create')}
            className={`wire flex-1 rounded-sm border px-4 py-3.5 ${intent === 'create' ? 'border-primary text-primary' : 'border-border text-chrome hover:border-chrome hover:text-foreground'}`}
          >
            + NEW ROOM
          </button>
          <button
            data-tour="join"
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
              placeholder="Room code (WR-XXXXXX) or the room link"
              className="flex-1"
            />
            {/* the button lights orange the moment the input parses — the
                "you may go" signal (user feedback, round 6) */}
            {/* the "you may go" signal: valid input → the button goes orange,
                grows, and glows (strengthened per round-9 feedback) */}
            <button
              onClick={joinByCode}
              disabled={!parseJoinInput(joinCode) || joining}
              className={`wire rounded-sm px-6 transition-all duration-200 ${
                parseJoinInput(joinCode)
                  ? 'scale-105 bg-primary font-semibold text-primary-foreground shadow-[0_0_14px_rgba(232,100,27,.55)] hover:brightness-110'
                  : 'border border-border text-chrome/50'
              }`}
            >
              {joining ? 'JOINING…' : 'JOIN →'}
            </button>
          </div>
        )}

        <TourOffer
          storageKey="warroom-tour-lobby"
          label="FIRST TIME AT THE DESK?"
          steps={LOBBY_TOUR}
        />

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
              <button
                onClick={() => (mine ? deleteRoom(r.recordId) : leaveRow(r.recordId))}
                className={`wire group-hover:inline ${
                  armedDelete === r.recordId
                    ? 'inline text-destructive'
                    : 'hidden text-chrome hover:text-destructive'
                }`}
                aria-label={`${mine ? 'Delete' : 'Leave'} ${r.data.name}`}
              >
                {armedDelete === r.recordId ? 'SURE?' : mine ? 'DELETE' : 'LEAVE'}
              </button>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
