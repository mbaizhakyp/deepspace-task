/**
 * The board — dark dot-grid ground, warm paper cards, live cursors,
 * wire log, facilitator freeze. Everything on it is synced records in
 * the `board:<roomId>` room; freeze is enforced server-side (worker.ts),
 * the UI here only mirrors it.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getUserColor, useAuthUser, useJobs, useMutations, usePresenceRoom, useQuery, useUsers } from 'deepspace'
import { Textarea, useToast } from '@/components/ui'
import { callAction } from '../lib/actions-client'
import { fitView, gridSpacing, toWorld, zoomView, type View } from '../lib/camera'
import { leftRooms } from '../lib/left-rooms'
import { TourResume } from './Tour'
import { TrashIcon } from '../pages/(app)/(protected)/rooms'

import { parseOptions, PollCard, type PollData, type VoteData } from './PollCard'
import { ImportPanel } from './ImportPanel'
import { SummaryPanel } from './SummaryPanel'
import type { Summary } from '../actions/summarize'

const ROOM_TOUR = [
  { anchor: 'import', title: 'BRING THE DOCUMENT', body: 'Import is where meetings start: browse your Google Docs or paste anything — the AI splits it into cards that land live for everyone.', media: '/tour/import.webm' },
  { anchor: 'poll', title: 'DECIDE', body: 'Contested point? Open a poll. One vote per person — enforced by the database, not the buttons.', media: '/tour/poll.webm' },
  { anchor: 'card', title: 'ADD YOUR OWN', body: 'Drop a blank card wherever you\'re looking. Double-click any card to write on it; drag to arrange.' },
  { anchor: 'invite', title: 'GET THE TEAM IN', body: 'That IS the room code — click to copy it. Teammates enter it under JOIN BY LINK (or just open your room URL).' },
  { anchor: 'summarize', title: 'FILE THE DISPATCH', body: 'When it\'s decided, the AI writes "what was decided" — exportable as Markdown or PDF, with full history.', media: '/tour/summary.webm' },
  { anchor: 'hud', title: 'SELECT TOGETHER', body: 'Hold Shift and drag on empty ground to draw a rectangle over cards — then drag any selected card and the whole group moves with it. Esc or a click on empty ground deselects.', media: '/tour/select.webm', centered: true },
  { anchor: 'hud', title: 'THE CAMERA', body: 'Drag empty ground to pan, pinch to zoom, FIT ALL to frame everything. The download icon exports the whole board.' },
]

export type CardData = {
  title: string
  body: string
  x: number
  y: number
  origin?: string
  authorName?: string
  tint?: number
}

// per-batch paper stocks (D-042): warm, muted, unmistakably different rows
const BATCH_TINTS = ['#ece3cc', '#e2e7d2', '#ecdfd6', '#dde6e4']
type SettingsData = { facilitatorId: string; frozenBy?: string | null; frozenByName?: string | null }
type EventData = { at: number; text: string }

// the canvas is unlimited (D-024) — RESET fits everything back into view

export default function Board({
  roomId,
  roomName,
  roomCode,
  memberIds,
  facilitatorId,
  summary,
  summaryAt,
}: {
  roomId: string
  roomName: string
  roomCode: string | null
  memberIds: string[]
  facilitatorId: string
  summary: Summary | null
  summaryAt: number | null
}) {
  const { user } = useAuthUser()
  const { records: cards, status: cardsStatus } = useQuery<CardData>('cards', {})
  const { records: settingsRecords } = useQuery<SettingsData>('board_settings', {})
  const { records: events } = useQuery<EventData>('events', { orderBy: 'at', orderDir: 'desc', limit: 5 })
  const { records: polls, status: pollsStatus } = useQuery<PollData>('polls', {})
  const { records: allVotes } = useQuery<VoteData>('votes', {})
  const { create, put, remove, ready } = useMutations<CardData>('cards')
  const pollMutations = useMutations<PollData>('polls')
  const voteMutations = useMutations<{ pollId: string; voterId: string; optionIndex: number }>('votes')
  const eventMutations = useMutations<EventData>('events')
  const [pollDialogOpen, setPollDialogOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(true)
  const [panel, setPanel] = useState<'none' | 'import' | 'summary'>('none')
  const importOpen = panel === 'import'
  const { warning } = useToast()

  const settings = settingsRecords[0]?.data
  const frozen = Boolean(settings?.frozenBy)
  const isFacilitator = user?.id === facilitatorId
  const locked = frozen && !isFacilitator

  // ── presence: cursors + roster ──────────────────────────────────────
  const { peers: rawPeers, updateState } = usePresenceRoom(`board:${roomId}`)
  // one person = one presence, however many tabs they have open (B-007):
  // drop our own other tabs and keep the first connection per user
  const peers = rawPeers.filter(
    (p, i) => p.userId !== user?.id && rawPeers.findIndex((q) => q.userId === p.userId) === i,
  )
  const memberCount = Math.max(memberIds.length, peers.length + 1)
  // roster (public identity) for the member list popover (D-051)
  const { users: roster } = useUsers()
  const [membersOpen, setMembersOpen] = useState(false)
  const onlineIds = new Set([user?.id ?? '', ...peers.map((p) => p.userId)])
  const fieldRef = useRef<HTMLDivElement>(null)
  const lastCursorSent = useRef(0)

  // ── camera (D-022): local per-user pan/zoom; records keep world coords ──
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const pan = useRef<{ px: number; py: number } | null>(null)

  // wheel = pan, ctrl/cmd+wheel (trackpad pinch) = zoom at the pointer.
  // Native listener: React's onWheel can't preventDefault (passive).
  useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = field.getBoundingClientRect()
      const v = viewRef.current
      setView(
        e.ctrlKey || e.metaKey
          ? zoomView(v, e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.005))
          : { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY },
      )
    }
    field.addEventListener('wheel', onWheel, { passive: false })
    return () => field.removeEventListener('wheel', onWheel)
  }, [])

  function zoomBy(factor: number) {
    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return
    setView((v) => zoomView(v, rect.width / 2, rect.height / 2, factor))
  }

  // RESET = fit everything (cards AND polls) back into the window — the way
  // home on an unlimited canvas.
  function fitAll() {
    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return
    const boxes = [
      ...cards.map((c) => ({ x: c.data.x, y: c.data.y, w: 280, h: 200 })),
      ...polls.map((p) => ({ x: p.data.x ?? 400, y: p.data.y ?? 200, w: 340, h: 280 })),
    ]
    setGlide(true)
    setView(
      boxes.length === 0
        ? { x: 0, y: 0, scale: 1 }
        : fitView(
            Math.min(...boxes.map((b) => b.x)),
            Math.min(...boxes.map((b) => b.y)),
            Math.max(...boxes.map((b) => b.x + b.w)),
            Math.max(...boxes.map((b) => b.y + b.h)),
            rect.width,
            rect.height,
          ),
    )
    setTimeout(() => setGlide(false), 750)
  }

  // When an import lands, glide everyone's camera to the new cards — unless
  // that person is mid-drag/pan (never move a view under a busy hand).
  // Trigger on the observed running→succeeded transition only, so entering a
  // room with an old finished import doesn't jump the camera.
  const [glide, setGlide] = useState(false)
  const { jobs } = useJobs(`board:${roomId}`)
  const importJob = jobs.find((j) => j.type === 'import-text')
  const prevImportStatus = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevImportStatus.current
    prevImportStatus.current = importJob?.status ?? null
    if (importJob?.status !== 'succeeded' || prev === null || prev === 'succeeded') return
    if (drag || pan.current) return
    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return
    // the job reports THIS batch's bounding box (B-011) so a second import
    // centers on its own cards, not every import ever
    const bbox = (importJob.result as { bbox?: number[] } | undefined)?.bbox
    let target: View | null = null
    if (bbox && bbox.length === 4) {
      target = fitView(bbox[0], bbox[1], bbox[2], bbox[3], rect.width, rect.height)
    } else {
      const imported = cards.filter((c) => c.data.origin === 'imported')
      if (imported.length > 0) {
        const xs = imported.map((c) => c.data.x)
        const ys = imported.map((c) => c.data.y)
        target = fitView(Math.min(...xs), Math.min(...ys), Math.max(...xs) + 280, Math.max(...ys) + 190, rect.width, rect.height)
      }
    }
    if (!target) return
    setGlide(true)
    setView(target)
    setTimeout(() => setGlide(false), 750)
  }, [importJob?.status])

  function fieldWorldPoint(e: React.PointerEvent): { wx: number; wy: number } | null {
    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return null
    return toWorld(viewRef.current, e.clientX - rect.left, e.clientY - rect.top)
  }

  function onFieldPointerMove(e: React.PointerEvent) {
    const now = performance.now()
    if (now - lastCursorSent.current < 60) return
    lastCursorSent.current = now
    const p = fieldWorldPoint(e)
    // world coords: peers render your cursor glued to the cards, whatever
    // their own camera is doing
    if (p) updateState({ cx: p.wx, cy: p.wy, name: user?.fullName ?? '?' })
  }

  // ── drag: group-based (D-049). A drag always moves a GROUP — the marquee
  // selection when the grabbed item is in it, otherwise just that item. ──
  type Member = { id: string; kind: 'card' | 'poll'; x0: number; y0: number }
  const [drag, setDrag] = useState<{ lead: string; dx: number; dy: number; ox: number; oy: number; group: Member[] } | null>(null)
  const [groupPos, setGroupPos] = useState<Map<string, { x: number; y: number }> | null>(null)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const lastDragSync = useRef(0)

  // ── marquee multi-select (D-049): Shift+drag on empty ground ──
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function marqueeHits(m: { x0: number; y0: number; x1: number; y1: number }): Set<string> {
    const [mx0, mx1] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)]
    const [my0, my1] = [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)]
    const hit = new Set<string>()
    const overlaps = (x: number, y: number, w: number, h: number) =>
      x < mx1 && x + w > mx0 && y < my1 && y + h > my0
    for (const c of cards) if (overlaps(c.data.x, c.data.y, 256, 160)) hit.add(c.recordId)
    for (const pl of polls) if (overlaps(pl.data.x ?? 400, pl.data.y ?? 200, 320, 260)) hit.add(pl.recordId)
    return hit
  }

  function startDrag(e: React.PointerEvent, id: string, kind: 'card' | 'poll', x: number, y: number) {
    e.stopPropagation() // grabbing a card must not also pan the board
    if (locked) {
      setShakeId(id)
      setTimeout(() => setShakeId(null), 350)
      warning('Board is frozen', `${settings?.frozenByName ?? 'The facilitator'} froze the board`)
      return
    }
    const p = fieldWorldPoint(e)
    if (!p) return
    // dragging an unselected item drops the old selection (desktop convention)
    const inSel = sel.has(id)
    if (!inSel && sel.size > 0) setSel(new Set())
    const ids = inSel ? sel : new Set([id])
    const group: Member[] = [
      ...cards.filter((c) => ids.has(c.recordId)).map((c) => ({ id: c.recordId, kind: 'card' as const, x0: c.data.x, y0: c.data.y })),
      ...polls.filter((pl) => ids.has(pl.recordId)).map((pl) => ({ id: pl.recordId, kind: 'poll' as const, x0: pl.data.x ?? 400, y0: pl.data.y ?? 200 })),
    ]
    setDrag({ lead: id, dx: p.wx - x, dy: p.wy - y, ox: x, oy: y, group })
  }

  function syncMember(m: Member, dX: number, dY: number) {
    const pos = { x: m.x0 + dX, y: m.y0 + dY }
    if (m.kind === 'card') void put(m.id, pos as Partial<CardData>)
    else void pollMutations.put(m.id, pos)
  }

  function onDragMove(e: React.PointerEvent) {
    onFieldPointerMove(e)
    if (marquee) {
      const p = fieldWorldPoint(e)
      if (p) {
        const next = { ...marquee, x1: p.wx, y1: p.wy }
        setMarquee(next)
        setSel(marqueeHits(next)) // live highlight while dragging the rectangle
      }
      return
    }
    if (pan.current) {
      const { px, py } = pan.current
      pan.current = { px: e.clientX, py: e.clientY }
      setView((v) => ({ ...v, x: v.x + e.clientX - px, y: v.y + e.clientY - py }))
      return
    }
    if (!drag) return
    const p = fieldWorldPoint(e)
    if (!p) return
    const dX = p.wx - drag.dx - drag.ox
    const dY = p.wy - drag.dy - drag.oy
    setGroupPos(new Map(drag.group.map((m) => [m.id, { x: m.x0 + dX, y: m.y0 + dY }])))
    // stream positions while dragging so other windows see the move live
    const now = performance.now()
    if (now - lastDragSync.current > 120) {
      lastDragSync.current = now
      for (const m of drag.group) syncMember(m, dX, dY)
    }
  }

  // Post-drop settle (B-008): after release, items would render the last
  // SYNCED position (up to 120ms stale) until the final write echoes back —
  // a one-frame shake. Hold the drop positions locally while the echo lands.
  const [settledMap, setSettledMap] = useState<Map<string, { x: number; y: number }> | null>(null)

  function endDrag() {
    pan.current = null
    if (marquee) {
      setMarquee(null)
      setDrag(null)
      return
    }
    if (drag && groupPos) {
      const lead = groupPos.get(drag.lead)
      if (lead) {
        const dX = lead.x - drag.ox
        const dY = lead.y - drag.oy
        for (const m of drag.group) syncMember(m, dX, dY)
      }
      setSettledMap(groupPos)
      setTimeout(() => setSettledMap(null), 800)
    }
    setGroupPos(null)
    setDrag(null)
  }

  function overridePos(id: string): { x: number; y: number } | null {
    return groupPos?.get(id) ?? settledMap?.get(id) ?? null
  }

  // ── card CRUD ───────────────────────────────────────────────────────
  async function addCard() {
    // land the new card in the middle of wherever this user is looking
    const rect = fieldRef.current?.getBoundingClientRect()
    const c = rect ? toWorld(view, rect.width / 2, rect.height / 2) : { wx: 300, wy: 250 }
    await create({
      title: '',
      body: '',
      x: c.wx - 128 + (Math.random() - 0.5) * 120,
      y: c.wy - 60 + (Math.random() - 0.5) * 100,
      origin: 'added',
      authorName: user?.fullName ?? '',
    })
  }

  // Dev-only test hook: lets the freeze spec push a raw mutation through this
  // client's real authenticated socket, past the disabled UI — proving the
  // server (not the button state) rejects writes while frozen.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__warroomTest = {
      putCard: (id: string, patch: Record<string, unknown>) => put(id, patch as Partial<CardData>),
      cards: cards.map((c) => ({ id: c.recordId, x: c.data.x, y: c.data.y })),
      polls: polls.map((p) => ({ id: p.recordId, status: p.data.status })),
      putPoll: (id: string, patch: Record<string, unknown>) => pollMutations.put(id, patch as Partial<PollData>),
      createVote: (data: Record<string, unknown>) =>
        voteMutations.create(data as { pollId: string; voterId: string; optionIndex: number }),
    }
  }

  const [invited, setInvited] = useState(false)
  async function copyInvite() {
    // the button IS the code (round 9): what you copy is exactly what you
    // see, short enough to read aloud or type. Older code-less rooms fall
    // back to copying the link.
    const invite = roomCode ? `WR-${roomCode}` : window.location.href
    try {
      await navigator.clipboard.writeText(invite)
      setInvited(true)
      setTimeout(() => setInvited(false), 2000)
    } catch {
      warning('Could not copy', roomCode ? `The code is WR-${roomCode}` : 'Copy the address bar URL instead')
    }
  }

  // ── leave (member) / delete (facilitator), armed two-step like the lobby ──
  const navigate = useNavigate()
  const [armedExit, setArmedExit] = useState(false)
  async function leaveOrDelete() {
    if (!armedExit) {
      setArmedExit(true)
      setTimeout(() => setArmedExit(false), 2500)
      return
    }
    setArmedExit(false)
    const res = isFacilitator
      ? await callAction('delete-room', { roomId })
      : await callAction('leave-room', { roomId, userName: user?.fullName ?? '' })
    if (res.success) {
      if (!isFacilitator) leftRooms.add(roomId) // B-015: our leave can't sync back to us
      navigate('/rooms')
    } else warning(isFacilitator ? 'Could not delete the room' : 'Could not leave', res.error)
  }

  // ── board export: the whole table as Markdown (cards, polls, tallies) ──
  function exportBoard() {
    const lines = [
      `# ${roomName} — board export`,
      '',
      `Exported ${new Date().toLocaleString()} · ${cards.length} cards · ${polls.length} polls`,
      '',
      '## Cards',
      '',
      ...cards.map((c) => {
        const meta = `${c.data.origin === 'imported' ? 'imported' : 'added'}${c.data.authorName ? ` · ${c.data.authorName}` : ''}`
        return `- **${c.data.title || 'Untitled'}** — ${c.data.body || '(empty)'} _(${meta})_`
      }),
      '',
      '## Polls',
      '',
      ...(polls.length === 0 ? ['(none)'] : []),
      ...polls.map((p) => {
        const opts = parseOptions(p.data.options)
        const votes = allVotes.filter((v) => v.data.pollId === p.recordId)
        const tally = opts
          .map((o, i) => `${o} ${votes.filter((v) => v.data.optionIndex === i).length}`)
          .join(' · ')
        return `- **${p.data.question}** (${p.data.status === 'closed' ? 'decided' : 'live'}) — ${tally}`
      }),
    ]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }))
    a.download = `${roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-board.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function toggleFreeze() {
    const res = await callAction('set-freeze', {
      roomId,
      frozen: !frozen,
      userName: user?.fullName ?? 'facilitator',
    })
    if (!res.success) warning('Freeze failed', res.error)
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="flex h-14 flex-none items-center gap-4 border-b border-border bg-card px-5">
        <Link
          to="/rooms"
          title="Back to the lobby"
          className="wire -ml-1 rounded-sm px-1.5 py-2 text-chrome hover:text-foreground"
        >
          ← LOBBY
        </Link>
        <h1 className="font-serif text-2xl text-foreground">{roomName}</h1>
        <div className="flex-1" />
        <div className="flex items-center pl-1">
          {[{ userId: user?.id ?? 'me', userName: user?.fullName ?? 'me' }, ...peers].map((p) => (
            <div
              key={p.userId}
              title={p.userName}
              className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[10px] font-semibold text-background"
              style={{ backgroundColor: getUserColor(p.userId) }}
            >
              {(p.userName || '?').charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
        {/* who's HERE vs who's IN — different facts, both shown; click for
            the roster (D-051: star = facilitator, YOU = you, dot = online) */}
        <div className="relative">
          <button
            onClick={() => setMembersOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-sm px-1 py-1 hover:bg-accent"
            title="Who's in this room"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-live breathe" />
            <span className="wire text-chrome">
              {peers.length + 1} ONLINE
              <span className="text-chrome/60"> · {memberCount} MEMBERS</span>
            </span>
          </button>
          {membersOpen && (
            <div className="absolute left-0 top-10 z-[70] flex w-60 flex-col rounded-sm border border-border bg-popover p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.45)]">
              {memberIds.map((id) => {
                const isMe = id === user?.id
                const name = isMe ? 'You' : (roster.find((u) => u.id === id)?.name ?? 'someone')
                return (
                  <div key={id} className="flex items-center gap-2 rounded-[2px] px-2 py-1.5">
                    <span
                      className={`h-1.5 w-1.5 flex-none rounded-full ${onlineIds.has(id) ? 'bg-live' : 'bg-border'}`}
                      title={onlineIds.has(id) ? 'Online' : 'Offline'}
                    />
                    <span
                      className="h-4 w-4 flex-none rounded-full text-center text-[9px] font-semibold leading-4 text-background"
                      style={{ backgroundColor: getUserColor(id) }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </span>
                    <span className={`truncate text-[13px] ${isMe ? 'font-semibold text-primary' : 'text-foreground'}`}>
                      {name}
                    </span>
                    {id === facilitatorId && (
                      <span className="ml-auto text-signal" title="Facilitator">★</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {/* room controls | board actions — glyphs differentiate at a glance
            without breaking the wire voice (no emoji in chrome) */}
        {/* fixed width: the label swap must never reflow the header (D-042) */}
        <button
          data-tour="invite"
          onClick={copyInvite}
          title={roomCode ? 'Copy the room code — teammates enter it under JOIN BY LINK' : 'Copy the room link'}
          className="btn-solid wire flex w-32 flex-none items-center justify-center gap-1.5 rounded-sm px-3 py-2 font-medium"
        >
          <Glyph name="invite" />
          {invited ? 'COPIED ✓' : roomCode ? `WR-${roomCode}` : 'COPY LINK'}
        </button>
        {isFacilitator && (
          <button
            onClick={toggleFreeze}
            className={
              frozen
                ? 'wire flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 font-medium text-primary-foreground'
                : 'wire flex items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-chrome hover:border-chrome hover:text-foreground'
            }
          >
            <Glyph name="freeze" />
            {frozen ? 'UNFREEZE' : 'FREEZE'}
          </button>
        )}
        <div className="mx-1 h-6 w-px bg-border" />
        <button
          data-tour="import"
          onClick={() => setPanel(importOpen ? 'none' : 'import')}
          disabled={locked}
          // the journey's first move — solid tier so it reads as the way in (D-045)
          className={`btn-solid wire flex items-center gap-1.5 rounded-sm px-3.5 py-2 font-medium disabled:opacity-50 ${importOpen ? 'outline outline-1 outline-primary' : ''}`}
        >
          <Glyph name="import" />
          IMPORT
        </button>
        <button
          data-tour="poll"
          onClick={() => setPollDialogOpen(true)}
          disabled={!pollMutations.ready || locked}
          className="wire flex items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-chrome hover:border-chrome hover:text-foreground disabled:opacity-50"
        >
          <Glyph name="poll" />
          NEW POLL
        </button>
        <button
          data-tour="card"
          onClick={addCard}
          disabled={!ready || locked}
          className="wire flex items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-chrome hover:border-chrome hover:text-foreground disabled:opacity-50"
        >
          <Glyph name="card" />
          ADD CARD
        </button>
        <div className="mx-1 h-6 w-px bg-border" />
        <button
          data-tour="summarize"
          onClick={() => setPanel(panel === 'summary' ? 'none' : 'summary')}
          className="rounded-sm bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground"
        >
          Summarize
        </button>
        {/* leave/delete: inline two-step arm, no popups (D-019) */}
        <button
          onClick={leaveOrDelete}
          title={isFacilitator ? 'Delete this room' : 'Leave this room'}
          aria-label={isFacilitator ? 'DELETE ROOM' : 'LEAVE'}
          className={`wire flex items-center gap-1 rounded-sm px-2 py-2 ${armedExit ? 'text-destructive' : 'text-destructive/70 hover:text-destructive'}`}
        >
          {armedExit ? 'SURE?' : isFacilitator ? <TrashIcon /> : 'LEAVE'}
        </button>
      </div>

      {pollDialogOpen && (
        <NewPollDialog
          onClose={() => setPollDialogOpen(false)}
          onCreate={async (question, options) => {
            const rect = fieldRef.current?.getBoundingClientRect()
            const c = rect ? toWorld(view, rect.width / 2, rect.height / 2) : { wx: 480, wy: 200 }
            await pollMutations.create({
              question,
              options,
              status: 'open',
              x: c.wx - 160 + (Math.random() - 0.5) * 100,
              y: c.wy - 120 + (Math.random() - 0.5) * 80,
              authorName: user?.fullName ?? '',
            })
            await eventMutations.create({ at: Date.now(), text: `POLL OPENED · ${question.toUpperCase().slice(0, 40)}` })
            setPollDialogOpen(false)
          }}
        />
      )}

      {/* board field + optional import panel */}
      <div className="flex min-h-0 flex-1">
      <div
        ref={fieldRef}
        // select-none: without it a pan drag runs a native text selection
        // across every card it crosses (B-009). The dot grid lives on the
        // field itself (shifted/scaled with the camera) — the canvas is
        // unlimited, so there is no world rect to paint it on.
        className={`dotgrid relative flex-1 touch-none select-none overflow-hidden bg-background ${frozen ? 'brightness-[.85]' : ''}`}
        style={{
          backgroundSize: `${gridSpacing(view.scale)}px ${gridSpacing(view.scale)}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          if (e.shiftKey) {
            const p = fieldWorldPoint(e)
            if (p) setMarquee({ x0: p.wx, y0: p.wy, x1: p.wx, y1: p.wy })
            return
          }
          if (sel.size > 0) setSel(new Set()) // click on empty ground deselects
          pan.current = { px: e.clientX, py: e.clientY }
        }}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* everything in world coordinates lives inside this transform */}
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0',
            // only the import-landed / fit-all glide animates; hand pans stay 1:1
            transition: glide ? 'transform 700ms cubic-bezier(0.25, 1, 0.35, 1)' : undefined,
          }}
        >
        {cards.map((c) => (
          <BoardCard
            key={c.recordId}
            id={c.recordId}
            data={c.data}
            dragPos={overridePos(c.recordId)}
            selected={sel.has(c.recordId)}
            shake={shakeId === c.recordId}
            locked={locked}
            // mirror the server rule (delete: 'own') — showing × on cards the
            // DO would refuse to delete is client-side theater
            canDelete={!locked && ready && c.createdBy === user?.id}
            onPointerDown={(e) => startDrag(e, c.recordId, 'card', c.data.x, c.data.y)}
            onSave={(patch) => put(c.recordId, patch as Partial<CardData>)}
            onDelete={() => remove(c.recordId)}
          />
        ))}

        {polls.map((p) => (
          <PollCard
            key={p.recordId}
            pollId={p.recordId}
            data={p.data}
            selected={sel.has(p.recordId)}
            memberCount={memberCount}
            isFacilitator={isFacilitator}
            locked={locked}
            // mirrors the server rule (pollDeleteDenial: creator or facilitator)
            canDelete={!locked && (p.createdBy === user?.id || isFacilitator)}
            onDelete={() => void pollMutations.remove(p.recordId)}
            dragPos={overridePos(p.recordId)}
            onPointerDown={(e) =>
              startDrag(e, p.recordId, 'poll', p.data.x ?? 400, p.data.y ?? 200)
            }
          />
        ))}

        {/* marquee rectangle — Shift+drag on empty ground */}
        {marquee && (
          <div
            className="pointer-events-none absolute z-40 border border-primary/70 bg-primary/10"
            style={{
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
            }}
          />
        )}

        {/* peer cursors */}
        {peers.map((p) => {
          const { cx, cy, name } = p.state as { cx?: number; cy?: number; name?: string }
          if (typeof cx !== 'number' || typeof cy !== 'number') return null
          return (
            <div key={p.userId} className="pointer-events-none absolute z-40 transition-all duration-75" style={{ left: cx, top: cy }}>
              <svg width="14" height="16" viewBox="0 0 14 16">
                <path d="M1 1 L13 9 L7 10 L5 15 Z" fill={getUserColor(p.userId)} stroke="#101210" strokeWidth="1" />
              </svg>
              <span
                className="ml-2 inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-background"
                style={{ backgroundColor: getUserColor(p.userId) }}
              >
                {name ?? p.userName}
              </span>
            </div>
          )
        })}
        </div>

        {/* camera HUD — screen-fixed, like the wire log; solid fill so the
            controls read on any board (D-043) */}
        <div data-tour="hud" className="wire absolute bottom-4 right-5 z-30 flex items-center gap-2 text-chrome">
          <button
            onClick={exportBoard}
            className="hud-chip mr-1 rounded-sm px-2.5 py-2"
            title="Download the board as Markdown"
            aria-label="Download the board as Markdown"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
              <path d="M7 1.5V8M4.5 5.5L7 8l2.5-2.5" />
              <path d="M1.5 9.5v2a1 1 0 001 1h9a1 1 0 001-1v-2" />
            </svg>
          </button>
          <button onClick={() => zoomBy(1 / 1.25)} className="hud-chip rounded-sm px-3 py-1.5 text-[13px] leading-[14px]" aria-label="Zoom out">−</button>
          <span className="w-10 text-center tabular-nums">{Math.round(view.scale * 100)}%</span>
          <button onClick={() => zoomBy(1.25)} className="hud-chip rounded-sm px-3 py-1.5 text-[13px] leading-[14px]" aria-label="Zoom in">+</button>
          {/* "RESET" read as "wipe the board" — it frames, so say so (D-032) */}
          <button onClick={fitAll} className="hud-chip ml-1 flex items-center gap-1.5 rounded-sm px-3 py-2" title="Bring every card and poll into view">
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
              <path d="M1 3.5V1h2.5M8.5 1H11v2.5M11 8.5V11H8.5M3.5 11H1V8.5" />
              <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
            </svg>
            FIT ALL
          </button>
        </div>

        {/* board still syncing: don't claim emptiness before the data is in (B-020) */}
        {(cardsStatus !== 'ready' || pollsStatus !== 'ready') && cards.length === 0 && polls.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="wire breathe text-chrome">SYNCING THE TABLE</div>
          </div>
        )}
        {/* empty table: the journey's first move, made unmissable (D-045) */}
        {cardsStatus === 'ready' && pollsStatus === 'ready' && cards.length === 0 && polls.length === 0 && !importOpen && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
            <div className="font-serif text-3xl text-foreground/90">An empty table.</div>
            <p className="wire text-chrome">BRING A DOCUMENT — CARDS LAND LIVE FOR EVERYONE</p>
            <button
              onClick={() => setPanel('import')}
              disabled={locked}
              className="btn-solid wire pointer-events-auto mt-2 rounded-sm px-5 py-3 font-medium disabled:opacity-50"
            >
              IMPORT A DOCUMENT
            </button>
          </div>
        )}

        {/* wire log — the meeting writing its own record. Collapsible: the
            HIDE control rides the top edge and slides down as the log folds;
            events keep flowing underneath either way. */}
        <div className="pointer-events-none absolute bottom-4 left-5 z-30 flex flex-col gap-1">
          <button
            onClick={() => setLogsOpen((o) => !o)}
            className="wire pointer-events-auto self-start text-[9px] text-chrome/50 transition-colors hover:text-chrome"
          >
            {logsOpen ? 'HIDE ▾' : 'SHOW WIRE ▴'}
          </button>
          <div
            className={`flex flex-col gap-1 overflow-hidden transition-all duration-500 ease-in-out ${logsOpen ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'}`}
          >
            {[...events].reverse().map((e) => (
              <div key={e.recordId} className="wire wire-tick text-chrome">
                <span className="text-live">{formatTime(e.data.at)}</span>
                {'  '}
                {e.data.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {importOpen && <ImportPanel roomId={roomId} onClose={() => setPanel('none')} />}
      {panel === 'summary' && (
        <SummaryPanel
          roomId={roomId}
          roomName={roomName}
          summary={summary}
          summaryAt={summaryAt}
          onClose={() => setPanel('none')}
        />
      )}
      </div>

      <TourResume steps={ROOM_TOUR} />

      {/* frozen chrome */}
      {frozen && (
        <>
          <div className="pointer-events-none absolute inset-0 z-50 rounded-sm border-2 border-primary" />
          <div
            data-testid="frozen-banner"
            className="wire absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-sm border border-primary bg-card px-4 py-1.5 text-primary"
          >
            BOARD FROZEN BY {(settings?.frozenByName ?? 'FACILITATOR').toUpperCase()}
          </div>
        </>
      )}
    </div>
  )
}

/** 14px line glyphs for the toolbar — mono-weight strokes, chrome-colored. */
function Glyph({ name }: { name: 'invite' | 'freeze' | 'import' | 'poll' | 'card' }) {
  const paths: Record<string, React.ReactNode> = {
    invite: (
      <>
        <circle cx="5" cy="4.5" r="2.2" />
        <path d="M1.5 12c0-2.6 1.8-4.2 3.5-4.2S8.5 9.4 8.5 12" />
        <path d="M11.5 3.5v4M9.5 5.5h4" />
      </>
    ),
    freeze: <path d="M7 1.5v11M2.2 4.25l9.6 5.5M11.8 4.25l-9.6 5.5" />,
    import: (
      <>
        <path d="M7 1.5V8M4.5 5.5L7 8l2.5-2.5" />
        <path d="M1.5 9.5v2a1 1 0 001 1h9a1 1 0 001-1v-2" />
      </>
    ),
    poll: <path d="M2.5 12.5v-5M7 12.5v-9M11.5 12.5v-3" />,
    card: (
      <>
        <rect x="1.75" y="1.75" width="10.5" height="10.5" rx="1" />
        <path d="M7 4.75v4.5M4.75 7h4.5" />
      </>
    ),
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
      {paths[name]}
    </svg>
  )
}

function BoardCard({
  id,
  data,
  dragPos,
  selected,
  shake,
  locked,
  canDelete,
  onPointerDown,
  onSave,
  onDelete,
}: {
  id: string
  data: CardData
  dragPos: { x: number; y: number } | null
  selected: boolean
  shake: boolean
  locked: boolean
  canDelete: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onSave: (patch: Partial<CardData>) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(data.title)
  const [draftBody, setDraftBody] = useState(data.body)

  const x = dragPos?.x ?? data.x
  const y = dragPos?.y ?? data.y

  function save() {
    setEditing(false)
    if (draftTitle !== data.title || draftBody !== data.body) {
      onSave({ title: draftTitle, body: draftBody })
    }
  }

  return (
    <div
      // imported cards land on batch-colored stock (D-042): every import run
      // is a different paper, so batches read as groups at board distance.
      // The WHOLE card drags (edges included) — grabbing the padding used to
      // fall through to the board and pan instead (caught in D-049 testing).
      className={`card-drop absolute w-64 rounded-sm bg-paper p-4 shadow-[0_2px_6px_rgba(26,26,22,.35)] ${locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} ${selected ? 'ring-2 ring-primary/60' : ''} ${shake ? 'locked-shake' : ''} ${dragPos ? 'z-30' : 'z-10'}`}
      style={{
        left: x,
        top: y,
        transform: `rotate(${rotationFor(id)}deg)`,
        backgroundColor:
          data.origin === 'imported' ? BATCH_TINTS[(data.tint ?? 0) % BATCH_TINTS.length] : undefined,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        if (locked) return
        setDraftTitle(data.title)
        setDraftBody(data.body)
        setEditing(true)
      }}
    >
      <div>
        {editing ? (
          <div onPointerDown={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="Title"
              className="w-full border-none bg-transparent font-serif text-xl text-ink outline-none placeholder:text-ink-muted"
            />
            <Textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              onBlur={save}
              placeholder="What's the point?"
              className="mt-1 min-h-16 w-full resize-none border-none bg-transparent p-0 text-[13px] leading-relaxed text-ink shadow-none focus-visible:ring-0"
            />
          </div>
        ) : (
          <>
            {data.title && <div className="font-serif text-xl leading-tight text-ink">{data.title}</div>}
            <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
              {data.body || <span className="text-ink-muted">Double-click to write</span>}
            </div>
          </>
        )}
        <div className="wire mt-3 text-[10px] text-ink-muted">
          {(data.origin === 'imported' ? 'IMPORTED' : 'ADDED') +
            (data.authorName ? ` · ${data.authorName.toUpperCase()}` : '')}
        </div>
      </div>
      {canDelete && !editing && (
        <button
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-0.5 top-0.5 hidden p-1.5 text-base leading-none text-ink-muted hover:text-ink [div:hover>&]:block"
          aria-label="Delete card"
        >
          ×
        </button>
      )}
    </div>
  )
}

function NewPollDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (question: string, options: string[]) => Promise<void>
}) {
  const [question, setQuestion] = useState('')
  const [optionsText, setOptionsText] = useState('')
  const options = optionsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
  const valid = question.trim().length > 0 && options.length >= 2

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-96 rounded-sm bg-paper p-6 shadow-[0_8px_30px_rgba(0,0,0,.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wire text-[10px] text-ink-muted">NEW POLL</div>
        <input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What are we deciding?"
          className="mt-2 w-full border-none bg-transparent font-serif text-2xl text-ink outline-none placeholder:text-ink-muted/60"
        />
        <textarea
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          placeholder={'One option per line (2–4)\nHold Oct 20\nSlip to Oct 27'}
          className="mt-3 min-h-24 w-full resize-none rounded-sm border border-ink/15 bg-transparent p-2.5 text-[13px] text-ink outline-none placeholder:text-ink-muted/60"
        />
        <div className="mt-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="wire text-ink-muted hover:text-ink">
            CANCEL
          </button>
          <button
            onClick={() => valid && void onCreate(question.trim(), options)}
            disabled={!valid}
            className="rounded-sm bg-signal px-4 py-2 text-[13px] font-semibold text-ink disabled:opacity-40"
          >
            Open the poll
          </button>
        </div>
      </div>
    </div>
  )
}

/** Deterministic tiny rotation per card — paper on a table, stable across renders. */
function rotationFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((h % 11) - 5) / 10 // -0.5 .. 0.5
}

function formatTime(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
