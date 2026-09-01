/**
 * The dispatch — a cream sheet of what was decided, exportable as Markdown.
 * Summary lives on the app-scope room record, so it syncs to every member.
 */

import { useState } from 'react'
import { useAuthUser } from 'deepspace'
import { callAction } from '../lib/actions-client'
import type { Summary } from '../actions/summarize'

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

  // honest indeterminate progress: the summary is one AI call (~5–15s), so
  // these are elapsed-time stages, not fake percentages
  // ponytail: converting summarize to a JobRoom job (real progress like the
  // import) is the upgrade path if summaries ever grow past one call
  const STAGES = ['READING THE BOARD', 'WEIGHING THE POLLS', 'WRITING THE DISPATCH']

  async function run() {
    setWorking(true)
    setStage(0)
    setError(null)
    const ticker = setInterval(() => setStage((s) => Math.min(s + 1, 2)), 3500)
    const res = await callAction('summarize', {
      roomId,
      userName: user?.fullName ?? '',
    })
    clearInterval(ticker)
    setWorking(false)
    if (!res.success) setError(res.error ?? 'summary failed')
  }

  function download() {
    if (!summary) return
    const md = [
      `# ${roomName} — what was decided`,
      '',
      summary.headline,
      '',
      ...summary.decisions.flatMap((d) => [`## ${d.title}`, '', d.detail, '']),
      `---`,
      `Exported from Warroom · ${new Date(summaryAt ?? Date.now()).toLocaleString()}`,
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
    a.download = `${roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-dispatch.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="dispatch-sheet flex w-[26rem] flex-none flex-col overflow-y-auto bg-paper p-8 shadow-[-4px_0_12px_rgba(0,0,0,.4)]">
      <div className="wire flex items-center justify-between text-[10px] text-ink-muted">
        <span>DISPATCH · {roomName.toUpperCase().slice(0, 24)}</span>
        <button
          onClick={onClose}
          className="wire -mr-2 rounded-[2px] border border-ink/15 px-2.5 py-1.5 text-ink-muted hover:border-ink/40 hover:text-ink"
        >
          CLOSE ✕
        </button>
      </div>
      <div className="mt-4 font-serif text-4xl leading-none tracking-tight text-ink">
        What was decided.
      </div>

      {working ? (
        // same checkpoint language as the import journey — still honest
        // elapsed-time stages (one AI call, no real per-stage signal, D-018)
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
                  <span className="h-4 w-4 flex-none rounded-full border border-ink/20" />
                )}
                {i < STAGES.length - 1 && (
                  <div className="relative my-1 w-px flex-1 bg-ink/15" style={{ minHeight: 16 }}>
                    <div
                      className="absolute inset-x-0 top-0 bg-signal transition-all duration-700"
                      style={{ height: i < stage ? '100%' : '0%' }}
                    />
                  </div>
                )}
              </div>
              <div
                className={`wire flex-1 pb-3 pt-px ${i < stage ? 'text-signal' : i === stage ? 'text-ink' : 'text-ink-muted/60'}`}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      ) : summary ? (
        <>
          <p className="mt-4 text-[13px] leading-relaxed text-ink">{summary.headline}</p>
          <div className="mt-5 border-t border-ink/15 pt-5">
            <div className="flex flex-col gap-5">
              {summary.decisions.map((d, i) => (
                <div key={i}>
                  <div className="text-[15px] font-semibold text-ink">{d.title}</div>
                  <div className="mt-0.5 text-[13px] text-ink-muted">{d.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
          No dispatch yet. Summarize the board once the cards are argued over and the polls are
          closed — decisions read best when they're actually decided.
        </p>
      )}

      <div className="flex-1" />
      <div className="mt-8 flex items-center gap-3 border-t border-ink/15 pt-5">
        <button
          onClick={run}
          disabled={working}
          className="rounded-sm bg-signal px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50"
        >
          {working ? 'Writing…' : summary ? 'Refresh' : 'Summarize the board'}
        </button>
        {summary && (
          <>
            <button onClick={download} className="wire text-ink-muted hover:text-ink">
              .MD
            </button>
            {/* PDF for free via the print stylesheet — only the dispatch prints */}
            <button onClick={() => window.print()} className="wire text-ink-muted hover:text-ink">
              PRINT / PDF
            </button>
          </>
        )}
      </div>
      {error && <div className="wire mt-3 text-destructive">{error.toUpperCase()}</div>}
      {summaryAt && (
        <div className="wire mt-3 text-[10px] text-ink-muted">
          WRITTEN {new Date(summaryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}
