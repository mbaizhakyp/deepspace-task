/**
 * Import panel — paste a document, choose a mode, watch cards land.
 * The import runs as a durable background job in the board's job room;
 * everyone in the room sees the same progress stream (useJobs) and the
 * cards materialize on the board live as the job creates them.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthUser, useJobs } from 'deepspace'
import { callAction } from '../lib/actions-client'
import type { GDocListing } from '../actions/google-docs'

type ImportPayload = { roomId: string; text: string; mode: 'cards' | 'key-points'; userName?: string }
type ImportResult = { created?: number }

export function ImportPanel({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const { user } = useAuthUser()
  const { jobs, connected } = useJobs<ImportPayload, ImportResult>(`board:${roomId}`)
  const [source, setSource] = useState<'paste' | 'gdoc'>('paste')
  const [text, setText] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [mode, setMode] = useState<'cards' | 'key-points'>('cards')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [needsUpgrade, setNeedsUpgrade] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [docs, setDocs] = useState<GDocListing[] | null>(null)
  const [browsing, setBrowsing] = useState(false)

  const current = jobs.find((j) => j.type === 'import-text')
  const running = current?.status === 'queued' || current?.status === 'running'

  // ── the journey (D-023): checkpoints bound to REAL signals only ──────
  // flow 'progress' shows the stepper; it opens the moment work starts
  // (including the pre-enqueue Google fetch) and stays through the landed
  // state until dismissed. Other room members get it via `running`.
  const [flow, setFlow] = useState<'form' | 'progress'>('form')
  const [enqueued, setEnqueued] = useState(false)
  const [viaGdoc, setViaGdoc] = useState(false)
  useEffect(() => {
    if (running) {
      setFlow('progress')
      setEnqueued(true)
    } else if (current?.status === 'failed') {
      setFlow('form') // the form's error line takes over
    }
  }, [running, current?.status])

  const succeeded = current?.status === 'succeeded'
  const jobProgress = current?.progress ?? 0
  // the job reports 0.05 CHECKING ACCESS / 0.15 READING THE DOCUMENT, then
  // per-card ticks above 0.15 — that boundary splits segmenting from cards
  const makingCards = jobProgress > 0.15
  type StepState = 'done' | 'active' | 'pending'
  const steps: { label: string; state: StepState; detail?: string; bar?: number }[] = [
    ...(viaGdoc
      ? [{
          label: 'PULLING THE DOC FROM GOOGLE',
          state: (enqueued || current ? 'done' : submitting ? 'active' : 'pending') as StepState,
        }]
      : []),
    {
      label: 'READING & SEGMENTING',
      state: succeeded || makingCards ? 'done' : enqueued || current ? 'active' : 'pending',
    },
    {
      label: 'MAKING CARDS',
      state: succeeded ? 'done' : makingCards ? 'active' : 'pending',
      detail: !succeeded && makingCards ? current?.progressMessage : undefined,
      bar: succeeded ? 1 : makingCards ? (jobProgress - 0.15) / 0.85 : undefined,
    },
    {
      label: 'LANDED ON THE BOARD',
      state: succeeded ? 'done' : 'pending',
      detail: succeeded ? `${current?.result?.created ?? 0} CARDS · BOARD CENTERED ON THEM` : undefined,
    },
  ]

  /** Shared handling of a connection-needed response: open consent, ask to retry. */
  function handleConnection(res: { success: boolean; data?: unknown }): boolean {
    const conn = res.success
      ? (res.data as { needsConnection?: boolean; redirectUrl?: string } | undefined)
      : undefined
    if (!conn?.needsConnection) return false
    setConnecting(true)
    if (typeof conn.redirectUrl === 'string') {
      window.open(conn.redirectUrl, 'warroom-google-auth', 'width=520,height=640')
    }
    return true
  }

  async function browseDocs() {
    if (browsing) return
    setBrowsing(true)
    setSubmitError(null)
    setConnecting(false)
    const res = await callAction<{ docs?: GDocListing[]; needsConnection?: boolean; redirectUrl?: string }>(
      'list-gdocs',
      {},
    )
    setBrowsing(false)
    if (handleConnection(res)) return
    if (res.success && res.data?.docs) setDocs(res.data.docs)
    else setSubmitError(res.error ?? 'could not list your docs')
  }

  async function importDoc(params: { docId?: string; url?: string }) {
    if (running || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    setNeedsUpgrade(false)
    setConnecting(false)
    // the Google fetch happens inside the action, before the job exists —
    // show the journey now so the PULLING step is live, not retroactive
    setViaGdoc(true)
    setEnqueued(false)
    setFlow('progress')
    const res = await callAction<{ needsConnection?: boolean; redirectUrl?: string }>('import-gdoc', {
      roomId,
      ...params,
      mode,
      userName: user?.fullName ?? '',
    })
    setSubmitting(false)
    if (handleConnection(res)) {
      setFlow('form')
      return
    }
    if (res.success) {
      setDocUrl('')
      setDocs(null)
      setEnqueued(true)
    } else {
      setFlow('form')
      if (res.error === 'upgrade_required') setNeedsUpgrade(true)
      else setSubmitError(res.error ?? 'import failed')
    }
  }

  async function start() {
    const input = source === 'paste' ? text.trim() : docUrl.trim()
    if (!input || running || submitting) return
    if (source === 'gdoc') return importDoc({ url: docUrl })
    setSubmitting(true)
    setSubmitError(null)
    setNeedsUpgrade(false)
    setConnecting(false)
    // the action checks membership + free quota + Pro entitlement
    // server-side, then enqueues the job; progress streams back via useJobs
    const res = await callAction('start-import', {
      roomId,
      text,
      mode,
      userName: user?.fullName ?? '',
    })
    setSubmitting(false)
    if (res.success) {
      setText('')
      setViaGdoc(false)
      setEnqueued(true)
      setFlow('progress')
    } else if (res.error === 'upgrade_required') setNeedsUpgrade(true)
    else setSubmitError(res.error ?? 'import failed')
  }

  return (
    <div className="flex w-96 flex-none flex-col border-l border-border bg-card p-6">
      <div className="flex items-baseline justify-between">
        <div className="wire text-chrome">IMPORT A DOCUMENT</div>
        <button
          onClick={onClose}
          className="wire -mr-1 rounded-sm border border-border px-2.5 py-1.5 text-chrome hover:border-chrome hover:text-foreground"
        >
          CLOSE ✕
        </button>
      </div>

      {flow === 'progress' ? (
        <div className="mt-6" data-testid="import-journey">
          <div className="font-serif text-2xl text-foreground">
            {succeeded ? 'Import landed' : 'Import in progress'}
          </div>
          <div className="mt-6 flex flex-col">
            {steps.map((s, i) => (
              <div key={s.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <StepMarker state={s.state} />
                  {i < steps.length - 1 && (
                    <div className="relative my-1 w-px flex-1 bg-border" style={{ minHeight: 20 }}>
                      {/* the journey line fills as its step completes */}
                      <div
                        className="absolute inset-x-0 top-0 bg-live transition-all duration-700"
                        style={{ height: s.state === 'done' ? '100%' : '0%' }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1 pb-4 pt-px">
                  <div
                    className={`wire ${
                      s.state === 'done'
                        ? 'text-live'
                        : s.state === 'active'
                          ? 'text-foreground'
                          : 'text-chrome/50'
                    }`}
                  >
                    {s.label}
                  </div>
                  {s.bar !== undefined && s.state === 'active' && (
                    <div className="mt-2 h-0.5 rounded-full bg-border">
                      <div
                        className="h-0.5 rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.round(s.bar * 100)}%` }}
                      />
                    </div>
                  )}
                  {s.detail && (
                    <div className="wire wire-tick mt-1.5 text-[10px] text-chrome" key={s.detail}>
                      {s.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {succeeded ? (
            <button
              onClick={() => {
                setFlow('form')
                setEnqueued(false)
                setViaGdoc(false)
              }}
              className="wire mt-4 rounded-sm border border-border px-3 py-2 text-chrome hover:border-chrome hover:text-foreground"
            >
              IMPORT ANOTHER
            </button>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              Cards are landing on the board as they're made — everyone in the room is watching
              the same import.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-1 rounded-sm border border-border p-1">
            {(['paste', 'gdoc'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`wire flex-1 rounded-[2px] px-2 py-1.5 ${source === s ? 'bg-accent text-foreground' : 'text-chrome hover:text-foreground'}`}
              >
                {s === 'paste' ? 'PASTE TEXT' : 'GOOGLE DOC'}
              </button>
            ))}
          </div>
          {source === 'paste' ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste anything — a tidy doc, messy meeting notes, a transcript. Headings are a hint, not a requirement."
              className="mt-3 min-h-48 flex-none resize-none rounded-sm border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-chrome"
            />
          ) : (
            <>
              {docs === null ? (
                <button
                  onClick={browseDocs}
                  disabled={browsing}
                  className="wire mt-3 rounded-sm border border-border px-3 py-3 text-chrome hover:border-chrome hover:text-foreground disabled:opacity-50"
                >
                  {browsing ? 'FETCHING YOUR DOCS…' : 'BROWSE YOUR GOOGLE DOCS'}
                </button>
              ) : (
                <div className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => importDoc({ docId: d.id })}
                      disabled={submitting}
                      className="flex items-baseline justify-between gap-2 rounded-sm border border-border px-3 py-2.5 text-left hover:border-chrome disabled:opacity-50"
                    >
                      <span className="truncate text-[13px] text-foreground">{d.title}</span>
                      {d.modified && (
                        <span className="wire flex-none text-[10px] text-chrome/70">
                          {new Date(d.modified).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </button>
                  ))}
                  <button onClick={browseDocs} className="wire mt-1 self-start text-chrome hover:text-foreground">
                    REFRESH
                  </button>
                </div>
              )}
              <input
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="…or paste a doc link: docs.google.com/document/d/…"
                className="mt-3 rounded-sm border border-border bg-background p-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-chrome"
              />
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Fetched from your own Google account — you approve access once, we never see your
                password.
              </p>
              {connecting && (
                <div className="mt-3 rounded-sm border border-live/40 p-3">
                  <div className="wire text-live">FINISH CONNECTING IN THE POPUP</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Approve Google Docs access, then try again.
                  </p>
                </div>
              )}
            </>
          )}
          <div className="mt-4 flex flex-col gap-2">
            <ModeRadio
              checked={mode === 'cards'}
              onSelect={() => setMode('cards')}
              label="EVERYTHING AS CARDS"
              hint="Map the whole document onto the board"
            />
            <ModeRadio
              checked={mode === 'key-points'}
              onSelect={() => setMode('key-points')}
              label="KEY POINTS ONLY"
              hint="Just the decisions, questions, and risks"
            />
          </div>
          <button
            onClick={start}
            disabled={(source === 'paste' ? !text.trim() : !docUrl.trim()) || !connected || submitting}
            className="mt-5 rounded-sm bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {submitting ? 'Starting…' : 'Import to the board'}
          </button>
          {needsUpgrade && (
            <div className="mt-3 rounded-sm border border-primary/50 p-3">
              <div className="wire text-primary">FREE IMPORTS USED UP</div>
              <p className="mt-1 text-xs text-muted-foreground">
                This room has used its 3 free imports.{' '}
                <Link to="/pricing" className="text-primary underline-offset-2 hover:underline">
                  Pro removes the limit.
                </Link>
              </p>
            </div>
          )}
          {(submitError || current?.status === 'failed') && (
            <div className="wire mt-3 text-destructive">
              {(submitError ?? current?.error ?? 'IMPORT FAILED').toUpperCase()}
            </div>
          )}
          {current?.status === 'succeeded' && (
            <div className="wire mt-3 text-live">
              LANDED · {current.result?.created ?? 0} CARDS
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StepMarker({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full border border-live text-live">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 4.2 L3 6.2 L7 1.8" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full border border-primary">
        <span className="breathe h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
    )
  }
  return <span className="h-4 w-4 flex-none rounded-full border border-border" />
}

function ModeRadio({
  checked,
  onSelect,
  label,
  hint,
}: {
  checked: boolean
  onSelect: () => void
  label: string
  hint: string
}) {
  return (
    <button
      onClick={onSelect}
      className={`rounded-sm border px-3.5 py-2.5 text-left ${checked ? 'border-primary' : 'border-border hover:border-chrome'}`}
    >
      <span className={`wire block ${checked ? 'text-primary' : 'text-chrome'}`}>{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </button>
  )
}
