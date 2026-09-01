/**
 * Landing — a STATIC page (no auth fetch, no records WebSocket).
 * Per design-brief.md screen 6: serif headline, a live-looking product shot
 * of the Room, one orange CTA, mono three-step strip. The product shot is a
 * hand-built miniature of the board (reusing the app's own card-drop /
 * fillbar / breathe animations) plus a wire log that writes the meeting's
 * record on a loop — the signature element, not a screenshot. (D-021)
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const WIRE_LINES = [
  "14:02 MAYA IMPORTED 'Q3 PLAN' · 12 CARDS",
  '14:05 JONAS MOVED "PRICING" TO DECIDED',
  '14:07 POLL OPENED · SHIP FRIDAY?',
  '14:09 RUTH VOTED · 3 PRESENT',
  '14:11 POLL CLOSED · 4–1 · SHIP',
  '14:12 SUMMARY FILED · EXPORTED',
]

export default function Landing() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2600)
    return () => clearInterval(id)
  }, [])
  const line = WIRE_LINES[tick % WIRE_LINES.length]
  const prev = WIRE_LINES[(tick + WIRE_LINES.length - 1) % WIRE_LINES.length]

  return (
    <div
      data-testid="static-landing"
      className="dotgrid flex min-h-screen items-center justify-center px-6 py-16"
    >
      <div className="grid w-full max-w-6xl items-center gap-14 lg:grid-cols-2">
        {/* ── The pitch ── */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <p className="wire text-chrome">WARROOM</p>
          <h1 className="mt-4 max-w-2xl font-serif text-5xl leading-tight tracking-tight text-foreground sm:text-6xl">
            The meeting is the artifact.
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            A war room, not a call. Import a document, argue over it as live cards with your team,
            decide with polls — and leave with a record instead of a memory.
          </p>
          <div className="wire mt-8 flex items-center gap-3 text-chrome">
            <span>IMPORT</span>
            <span className="text-primary">→</span>
            <span>DECIDE</span>
            <span className="text-primary">→</span>
            <span>EXPORT</span>
          </div>
          <div className="wire mt-5 grid grid-cols-2 gap-x-10 gap-y-1.5 text-left text-[10px] text-chrome/70">
            {[
              'LIVE CARDS & CURSORS',
              'GOOGLE DOCS IMPORT',
              'ONE-VOTE POLLS',
              'FACILITATOR FREEZE',
              'AI DISPATCH SUMMARY',
              'INVITE BY LINK',
            ].map((f) => (
              <span key={f}>· {f}</span>
            ))}
          </div>
          <Link
            to="/rooms"
            className="mt-10 rounded-sm bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:brightness-110"
          >
            Open your war room
          </Link>
          <p className="wire mt-14 text-[10px] text-chrome/60">
            FREE · 3 IMPORTS PER ROOM · NO CALL REQUIRED
          </p>
        </div>

        {/* ── The product shot: a miniature Room assembling itself ── */}
        <div
          aria-hidden
          className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,.5)] lg:block"
        >
          {/* top bar */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="font-serif text-lg text-foreground">Q3 Launch</span>
            <span className="flex items-center gap-2.5">
              <span className="flex -space-x-1.5">
                {['#5B9BD5', '#D57A9B', '#7FB069'].map((c) => (
                  <span
                    key={c}
                    className="h-4 w-4 rounded-full border border-card"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
              <span className="wire flex items-center gap-1.5 text-chrome">
                <span className="breathe h-1.5 w-1.5 rounded-full bg-live" />3 PRESENT
              </span>
            </span>
          </div>

          {/* the board */}
          <div className="dotgrid relative h-[350px] bg-background">
            <MiniCard className="left-[5%] top-[7%] w-[42%] rotate-[-0.6deg]" delay={0.15}
              title="Pricing" body="Hold at $29 through Q3 — revisit after the churn read." />
            <MiniCard className="right-[5%] top-[7%] w-[40%] rotate-[0.5deg]" delay={0.35}
              title="Risk" body="EU cohort churn ticking up; support backlog is the lead suspect." />
            <MiniCard className="bottom-[8%] right-[5%] w-[30%] rotate-[-0.4deg]" delay={0.55}
              title="Owner" body="Maya drafts the launch note by Thursday." />

            {/* poll card */}
            <div
              className="card-drop absolute bottom-[8%] left-[5%] w-[52%] rounded border border-ink/10 bg-paper p-3 shadow-[0_2px_6px_rgba(26,26,22,.18)]"
              style={{ animationDelay: '0.75s' }}
            >
              <div className="font-serif text-[15px] text-ink">Ship Friday?</div>
              <PollRow label="SHIP" votes={4} width="80%" winner delay={1.1} />
              <PollRow label="PUSH A WEEK" votes={1} width="20%" delay={1.2} />
            </div>

            {/* live cursors */}
            <Cursor className="left-[47%] top-[46%]" name="MAYA" color="#5B9BD5" />
            <Cursor className="right-[24%] top-[30%]" name="JONAS" color="#D57A9B" />
          </div>

          {/* wire log: the meeting writing its own record */}
          <div className="border-t border-border px-4 py-2.5">
            <div className="wire truncate text-[10px] text-chrome/50">{prev}</div>
            <div key={tick} className="wire wire-tick mt-1 truncate text-chrome">
              {line}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniCard({
  className,
  delay,
  title,
  body,
}: {
  className: string
  delay: number
  title: string
  body: string
}) {
  return (
    <div
      className={`card-drop absolute rounded border border-ink/10 bg-paper p-3 shadow-[0_2px_6px_rgba(26,26,22,.18)] ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="font-serif text-[15px] text-ink">{title}</div>
      <div className="mt-1 text-[11px] leading-snug text-ink-muted">{body}</div>
    </div>
  )
}

function PollRow({
  label,
  votes,
  width,
  winner,
  delay,
}: {
  label: string
  votes: number
  width: string
  winner?: boolean
  delay: number
}) {
  return (
    <div className="relative mt-2 h-6 overflow-hidden rounded-[2px] bg-ink/5">
      <div
        className={`fillbar absolute inset-y-0 left-0 ${winner ? 'bg-signal/80' : 'bg-ink/8'}`}
        style={{ width, animationDelay: `${delay}s` }}
      />
      <div className="wire absolute inset-0 flex items-center justify-between px-2 text-[10px] text-ink">
        <span>{label}</span>
        <span>{votes}</span>
      </div>
    </div>
  )
}

function Cursor({ className, name, color }: { className: string; name: string; color: string }) {
  return (
    <div className={`absolute ${className}`}>
      <svg width="10" height="12" viewBox="0 0 10 12" fill={color}>
        <path d="M0 0 L10 8 L5 8 L3 12 Z" />
      </svg>
      <span
        className="wire ml-2 rounded-[2px] px-1 py-0.5 text-[9px] text-[#101210]"
        style={{ backgroundColor: color }}
      >
        {name}
      </span>
    </div>
  )
}
