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
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setWorking(true)
    setError(null)
    const res = await callAction('summarize', {
      roomId,
      userName: user?.fullName ?? '',
    })
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
    <div className="flex w-[26rem] flex-none flex-col overflow-y-auto bg-paper p-8 shadow-[-4px_0_12px_rgba(0,0,0,.4)]">
      <div className="wire flex items-baseline justify-between text-[10px] text-ink-muted">
        <span>DISPATCH · {roomName.toUpperCase().slice(0, 24)}</span>
        <button onClick={onClose} className="wire text-ink-muted hover:text-ink">
          CLOSE
        </button>
      </div>
      <div className="mt-4 font-serif text-4xl leading-none tracking-tight text-ink">
        What was decided.
      </div>

      {summary ? (
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
          <button onClick={download} className="wire text-ink-muted hover:text-ink">
            DOWNLOAD .MD
          </button>
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
