/**
 * Import panel — paste a document, choose a mode, watch cards land.
 * The import runs as a durable background job in the board's job room;
 * everyone in the room sees the same progress stream (useJobs) and the
 * cards materialize on the board live as the job creates them.
 */

import { useState } from 'react'
import { useAuthUser, useJobs } from 'deepspace'

type ImportPayload = { roomId: string; text: string; mode: 'cards' | 'key-points'; userName?: string }
type ImportResult = { created?: number }

export function ImportPanel({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const { user } = useAuthUser()
  const { jobs, connected, enqueue } = useJobs<ImportPayload, ImportResult>(`board:${roomId}`)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'cards' | 'key-points'>('cards')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const current = jobs.find((j) => j.type === 'import-text')
  const running = current?.status === 'queued' || current?.status === 'running'

  async function start() {
    if (!text.trim() || running || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await enqueue('import-text', {
        roomId,
        text,
        mode,
        userName: user?.fullName ?? '',
      }, { maxAttempts: 1 })
      setText('')
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'enqueue failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex w-96 flex-none flex-col border-l border-border bg-card p-6">
      <div className="flex items-baseline justify-between">
        <div className="wire text-chrome">IMPORT · PASTE TEXT</div>
        <button onClick={onClose} className="wire text-chrome hover:text-foreground">
          CLOSE
        </button>
      </div>

      {running && current ? (
        <div className="mt-6">
          <div className="font-serif text-2xl text-foreground">Import in progress</div>
          <div className="mt-6 h-0.5 rounded-full bg-border">
            <div
              className="h-0.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round((current.progress ?? 0) * 100)}%` }}
            />
          </div>
          <div className="wire wire-tick mt-3 text-foreground" key={current.progressMessage}>
            {current.progressMessage ?? 'WORKING'}
          </div>
          <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
            Cards are landing on the board as they're made — everyone in the room is watching the
            same import.
          </p>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste anything — a tidy doc, messy meeting notes, a transcript. Headings are a hint, not a requirement."
            className="mt-4 min-h-52 flex-none resize-none rounded-sm border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-chrome"
          />
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
            disabled={!text.trim() || !connected || submitting}
            className="mt-5 rounded-sm bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            Import to the board
          </button>
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
