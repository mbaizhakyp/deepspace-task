/**
 * The dispatch — what was decided, exportable as Markdown or PDF (print).
 * Panel chrome follows the active theme (D-042); print forces the paper
 * palette via the .dispatch-sheet rules in styles.css. The latest summary
 * lives on the app-scope room record; every summary ever written is also
 * kept in the board's `summaries` collection (history view).
 */

import { useState } from 'react'
import { useAuthUser, useQuery } from 'deepspace'
import { callAction } from '../lib/actions-client'
import { parseSummary, type Summary } from '../actions/summarize'

type SummaryRecord = { at: number; headline?: string; json?: unknown; authorName?: string }

/** History rows store json as an object (json column) or a string — take both. */
function coerceSummary(raw: unknown): Summary | null {
  if (typeof raw === 'string') return parseSummary(raw)
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (typeof o.headline === 'string' && Array.isArray(o.decisions)) return o as Summary
  }
  return null
}

export function SummaryPanel({
  roomId,
  roomName,
  summary,
  summaryAt,
  onClose,
}: {
  roomId: string
  roomName: string
  summary: Summary | null
  summaryAt: number | null
  onClose: () => void
}) {
  const { user } = useAuthUser()
  const [working, setWorking] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'current' | 'history'>('current')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fmtOpen, setFmtOpen] = useState(false)

  const { records: history } = useQuery<SummaryRecord>('summaries', {
    orderBy: 'at',
    orderDir: 'desc',
    limit: 20,
  })

  const selected = selectedId ? history.find((h) => h.recordId === selectedId) : null
  const shown = selected ? coerceSummary(selected.data.json) : summary
  const shownAt = selected ? selected.data.at : summaryAt

  // honest indeterminate progress: the summary is one AI call (~5–15s), so
  // these are elapsed-time stages, not fake percentages (D-018)
  const STAGES = ['READING THE BOARD', 'WEIGHING THE POLLS', 'WRITING THE DISPATCH']

  async function run() {
    setWorking(true)
    setStage(0)
    setError(null)
    setView('current')
    setSelectedId(null)
    const ticker = setInterval(() => setStage((s) => Math.min(s + 1, 2)), 3500)
    const res = await callAction('summarize', { roomId, userName: user?.fullName ?? '' })
    clearInterval(ticker)
    setWorking(false)
    if (!res.success) setError(res.error ?? 'summary failed')
  }

  function downloadMd() {
    if (!shown) return
    const md = [
      `# ${roomName} — what was decided`,
      '',
      shown.headline,
      '',
      ...shown.decisions.flatMap((d) => [`## ${d.title}`, '', d.detail, '']),
      `---`,
      `Exported from Warroom · ${new Date(shownAt ?? Date.now()).toLocaleString()}`,
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
    a.download = `${roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-dispatch.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="dispatch-sheet flex w-[26rem] flex-none flex-col overflow-y-auto border-l border-border bg-card p-8">
      {/* control bar on TOP — export without scrolling (user feedback) */}
      <div className="no-print wire flex items-center justify-between text-[10px] text-chrome">
        <span>DISPATCH · {roomName.toUpperCase().slice(0, 20)}</span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setView(view === 'history' ? 'current' : 'history')
              setSelectedId(null)
              setFmtOpen(false)
            }}
            title="Past dispatches"
            aria-label="Past dispatches"
            className={`rounded-sm border px-2 py-[5px] ${view === 'history' ? 'border-signal text-signal' : 'border-border hover:border-chrome hover:text-foreground'}`}
          >
            {/* history: a clock running backwards */}
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
              <path d="M2.5 7a4.5 4.5 0 104.5-4.5c-1.8 0-3.2.9-4 2.2" />
              <path d="M3 1.5v3h3M7 4.8V7l1.8 1.3" />
            </svg>
          </button>
          {shown && !working && (
            <span className="relative">
              <button
                onClick={() => setFmtOpen((o) => !o)}
                title="Download this dispatch"
                aria-label="Download this dispatch"
                className="btn-solid rounded-sm px-2 py-[5px]"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                  <path d="M7 1.5V8M4.5 5.5L7 8l2.5-2.5" />
                  <path d="M1.5 9.5v2a1 1 0 001 1h9a1 1 0 001-1v-2" />
                </svg>
              </button>
              {fmtOpen && (
                <span className="absolute right-0 top-8 z-50 flex w-36 flex-col rounded-sm border border-border bg-popover p-1 shadow-[0_4px_12px_rgba(0,0,0,.35)]">
                  <button
                    onClick={() => {
                      setFmtOpen(false)
                      downloadMd()
                    }}
                    className="wire rounded-[2px] px-2 py-2 text-left text-chrome hover:bg-accent hover:text-foreground"
                  >
                    MARKDOWN (.MD)
                  </button>
                  <button
                    onClick={() => {
                      setFmtOpen(false)
                      window.print()
                    }}
                    className="wire rounded-[2px] px-2 py-2 text-left text-chrome hover:bg-accent hover:text-foreground"
                  >
                    PDF (PRINT)
                  </button>
                </span>
              )}
            </span>
          )}
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close the dispatch panel"
            className="rounded-sm border border-border px-2 py-[5px] hover:border-chrome hover:text-foreground"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
            </svg>
          </button>
        </span>
      </div>

      <div className="mt-4 font-serif text-4xl leading-none tracking-tight text-foreground">
        What was decided.
      </div>

      {working ? (
        <div className="mt-6 flex flex-col">
          {STAGES.map((label, i) => (
            <div key={label} className="flex gap-3">
              <div className="flex flex-col items-center">
                {i < stage ? (
                  <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full border border-signal text-signal">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1 4.2 L3 6.2 L7 1.8" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </span>
                ) : i === stage ? (
                  <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full border border-signal">
                    <span className="breathe h-1.5 w-1.5 rounded-full bg-signal" />
                  </span>
                ) : (
                  <span className="h-4 w-4 flex-none rounded-full border border-border" />
                )}
                {i < STAGES.length - 1 && (
                  <div className="relative my-1 w-px flex-1 bg-border" style={{ minHeight: 16 }}>
                    <div
                      className="absolute inset-x-0 top-0 bg-signal transition-all duration-700"
                      style={{ height: i < stage ? '100%' : '0%' }}
                    />
                  </div>
                )}
              </div>
              <div
                className={`wire flex-1 pb-3 pt-px ${i < stage ? 'text-signal' : i === stage ? 'text-foreground' : 'text-chrome/50'}`}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      ) : view === 'history' ? (
        <div className="no-print mt-5 flex flex-col gap-1.5">
          {history.length === 0 && (
            <p className="text-[13px] text-muted-foreground">No dispatches written yet.</p>
          )}
          {history.map((h) => (
            <button
              key={h.recordId}
              onClick={() => {
                setSelectedId(h.recordId)
                setView('current')
              }}
              className="rounded-sm border border-border px-3 py-2.5 text-left hover:border-chrome"
            >
              <div className="truncate text-[13px] text-foreground">{h.data.headline ?? 'Dispatch'}</div>
              <div className="wire mt-1 text-[9px] text-chrome/70">
                {new Date(h.data.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {h.data.authorName ? ` · ${h.data.authorName.toUpperCase()}` : ''}
              </div>
            </button>
          ))}
        </div>
      ) : shown ? (
        <>
          {selected && (
            <button
              onClick={() => setSelectedId(null)}
              className="no-print wire mt-3 self-start text-signal hover:underline"
            >
              ← VIEWING A PAST DISPATCH — BACK TO LATEST
            </button>
          )}
          <p className="mt-4 text-[13px] leading-relaxed text-foreground">{shown.headline}</p>
          <div className="mt-5 border-t border-border pt-5">
            <div className="flex flex-col gap-5">
              {shown.decisions.map((d, i) => (
                <div key={i}>
                  <div className="text-[15px] font-semibold text-foreground">{d.title}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">{d.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Nothing to file yet. Import a document, argue it out — then summarize.
        </p>
      )}

      <div className="flex-1" />
      <div className="no-print mt-8 flex items-center gap-3 border-t border-border pt-5">
        <button
          onClick={run}
          disabled={working}
          className="rounded-sm bg-signal px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50"
        >
          {working ? 'Writing…' : summary ? 'Refresh' : 'Summarize the board'}
        </button>
      </div>
      {error && <div className="no-print wire mt-3 text-destructive">{error.toUpperCase()}</div>}
      {shownAt && !working && (
        <div className="wire mt-3 text-[10px] text-chrome">
          WRITTEN {new Date(shownAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}
