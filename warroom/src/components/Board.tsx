/**
 * The board — dark dot-grid ground, warm paper cards, live cursors,
 * wire log, facilitator freeze. Everything on it is synced records in
 * the `board:<roomId>` room; freeze is enforced server-side (worker.ts),
 * the UI here only mirrors it.
 */

import { useRef, useState } from 'react'
import { getUserColor, useAuthUser, useMutations, usePresenceRoom, useQuery } from 'deepspace'
import { Textarea, useToast } from '@/components/ui'
import { callAction } from '../lib/actions-client'
import { PollCard, type PollData } from './PollCard'
import { ImportPanel } from './ImportPanel'
import { SummaryPanel } from './SummaryPanel'
import type { Summary } from '../actions/summarize'

export type CardData = {
  title: string
  body: string
  x: number
  y: number
  origin?: string
  authorName?: string
}
type SettingsData = { facilitatorId: string; frozenBy?: string | null; frozenByName?: string | null }
type EventData = { at: number; text: string }

const FIELD_W = 1600
const FIELD_H = 900

export default function Board({
  roomId,
  roomName,
  facilitatorId,
  summary,
  summaryAt,
}: {
  roomId: string
  roomName: string
  facilitatorId: string
  summary: Summary | null
  summaryAt: number | null
}) {
  const { user } = useAuthUser()
  const { records: cards } = useQuery<CardData>('cards', {})
  const { records: settingsRecords } = useQuery<SettingsData>('board_settings', {})
  const { records: events } = useQuery<EventData>('events', { orderBy: 'at', orderDir: 'desc', limit: 5 })
  const { records: polls } = useQuery<PollData>('polls', {})
  const { create, put, remove, ready } = useMutations<CardData>('cards')
  const pollMutations = useMutations<PollData>('polls')
  const voteMutations = useMutations<{ pollId: string; voterId: string; optionIndex: number }>('votes')
  const eventMutations = useMutations<EventData>('events')
  const [pollDialogOpen, setPollDialogOpen] = useState(false)
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
  const fieldRef = useRef<HTMLDivElement>(null)
  const lastCursorSent = useRef(0)

  function onFieldPointerMove(e: React.PointerEvent) {
    const now = performance.now()
    if (now - lastCursorSent.current < 60) return
    lastCursorSent.current = now
    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return
    updateState({ cx: e.clientX - rect.left, cy: e.clientY - rect.top, name: user?.fullName ?? '?' })
  }

  // ── drag (cards and polls share it; kind picks the collection) ──────
  const [drag, setDrag] = useState<{ id: string; kind: 'card' | 'poll'; dx: number; dy: number; x: number; y: number } | null>(null)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const lastDragSync = useRef(0)

  function startDrag(e: React.PointerEvent, id: string, kind: 'card' | 'poll', x: number, y: number) {
    if (locked) {
      setShakeId(id)
      setTimeout(() => setShakeId(null), 350)
      warning('Board is frozen', `${settings?.frozenByName ?? 'The facilitator'} froze the board`)
      return
    }
    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return
    setDrag({ id, kind, dx: e.clientX - rect.left - x, dy: e.clientY - rect.top - y, x, y })
  }

  function syncDragPosition(id: string, kind: 'card' | 'poll', x: number, y: number) {
    if (kind === 'card') void put(id, { x, y } as Partial<CardData>)
    else void pollMutations.put(id, { x, y })
  }

  function onDragMove(e: React.PointerEvent) {
    onFieldPointerMove(e)
    if (!drag) return
    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clamp(e.clientX - rect.left - drag.dx, 0, FIELD_W - 40)
    const y = clamp(e.clientY - rect.top - drag.dy, 0, FIELD_H - 40)
    setDrag({ ...drag, x, y })
    // stream position while dragging so other windows see the card move live
    const now = performance.now()
    if (now - lastDragSync.current > 120) {
      lastDragSync.current = now
      syncDragPosition(drag.id, drag.kind, x, y)
    }
  }

  // Post-drop settle (B-008): after release, the card would render the last
  // SYNCED position (up to 120ms stale) until the final write echoes back —
  // a one-frame shake. Hold the drop position locally while the echo lands.
  const [settled, setSettled] = useState<{ id: string; x: number; y: number } | null>(null)

  function endDrag() {
    if (drag) {
      syncDragPosition(drag.id, drag.kind, drag.x, drag.y)
      setSettled({ id: drag.id, x: drag.x, y: drag.y })
      setTimeout(() => setSettled(null), 800)
    }
    setDrag(null)
  }

  function overridePos(id: string): { x: number; y: number } | null {
    if (drag?.id === id) return { x: drag.x, y: drag.y }
    if (settled?.id === id) return { x: settled.x, y: settled.y }
    return null
  }

  // ── card CRUD ───────────────────────────────────────────────────────
  async function addCard() {
    await create({
      title: '',
      body: '',
      x: 80 + Math.random() * 300,
      y: 100 + Math.random() * 200,
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
    // the room URL is the invite — anyone signed in who opens it becomes a member
    try {
      await navigator.clipboard.writeText(window.location.href)
      setInvited(true)
      setTimeout(() => setInvited(false), 2000)
    } catch {
      warning('Could not copy', 'Copy the address bar URL instead')
    }
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
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-live breathe" />
          <span className="wire text-chrome">{peers.length + 1} PRESENT</span>
        </div>
        <button
          onClick={copyInvite}
          className="wire rounded-sm border border-border px-3 py-2 text-chrome hover:border-chrome hover:text-foreground"
        >
          {invited ? 'LINK COPIED' : 'INVITE'}
        </button>
        {isFacilitator && (
          <button
            onClick={toggleFreeze}
            className={
              frozen
                ? 'wire rounded-sm bg-primary px-3 py-2 font-medium text-primary-foreground'
                : 'wire rounded-sm border border-border px-3 py-2 text-chrome hover:border-chrome hover:text-foreground'
            }
          >
            {frozen ? 'UNFREEZE' : 'FREEZE'}
          </button>
        )}
        <button
          onClick={() => setPanel(importOpen ? 'none' : 'import')}
          disabled={locked}
          className={`wire rounded-sm border px-3 py-2 disabled:opacity-50 ${importOpen ? 'border-primary text-primary' : 'border-border text-chrome hover:border-chrome hover:text-foreground'}`}
        >
          IMPORT
        </button>
        <button
          onClick={() => setPollDialogOpen(true)}
          disabled={!pollMutations.ready || locked}
          className="wire rounded-sm border border-border px-3 py-2 text-chrome hover:border-chrome hover:text-foreground disabled:opacity-50"
        >
          NEW POLL
        </button>
        <button
          onClick={addCard}
          disabled={!ready || locked}
          className="wire rounded-sm border border-border px-3 py-2 text-chrome hover:border-chrome hover:text-foreground disabled:opacity-50"
        >
          ADD CARD
        </button>
        <button
          onClick={() => setPanel(panel === 'summary' ? 'none' : 'summary')}
          className="rounded-sm bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground"
        >
          Summarize
        </button>
      </div>

      {pollDialogOpen && (
        <NewPollDialog
          onClose={() => setPollDialogOpen(false)}
          onCreate={async (question, options) => {
            await pollMutations.create({
              question,
              options,
              status: 'open',
              x: 380 + Math.random() * 200,
              y: 120 + Math.random() * 150,
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
        className={`dotgrid relative flex-1 overflow-auto ${frozen ? 'brightness-[.85]' : ''}`}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {cards.map((c) => (
          <BoardCard
            key={c.recordId}
            id={c.recordId}
            data={c.data}
            dragPos={overridePos(c.recordId)}
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
            isFacilitator={isFacilitator}
            locked={locked}
            // mirrors the server rule (polls delete: 'own')
            canDelete={!locked && p.createdBy === user?.id}
            onDelete={() => void pollMutations.remove(p.recordId)}
            dragPos={overridePos(p.recordId)}
            onPointerDown={(e) =>
              startDrag(e, p.recordId, 'poll', p.data.x ?? 400, p.data.y ?? 200)
            }
          />
        ))}

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

        {/* wire log — the meeting writing its own record */}
        <div className="pointer-events-none absolute bottom-4 left-5 z-30 flex flex-col gap-1">
          {[...events].reverse().map((e) => (
            <div key={e.recordId} className="wire wire-tick text-chrome">
              <span className="text-live">{formatTime(e.data.at)}</span>
              {'  '}
              {e.data.text}
            </div>
          ))}
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

function BoardCard({
  id,
  data,
  dragPos,
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
      className={`card-drop absolute w-64 rounded-sm bg-paper p-4 shadow-[0_2px_6px_rgba(26,26,22,.35)] ${shake ? 'locked-shake' : ''} ${dragPos ? 'z-30' : 'z-10'}`}
      style={{ left: x, top: y, transform: `rotate(${rotationFor(id)}deg)` }}
      onDoubleClick={() => {
        if (locked) return
        setDraftTitle(data.title)
        setDraftBody(data.body)
        setEditing(true)
      }}
    >
      <div
        className={locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}
        onPointerDown={onPointerDown}
      >
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
          className="absolute right-1.5 top-1 hidden text-ink-muted hover:text-ink [div:hover>&]:block"
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

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
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
