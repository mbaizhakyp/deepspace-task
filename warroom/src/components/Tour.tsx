/**
 * Walkthrough (D-045, rebuilt D-046) — ONE continuous guided tour that starts
 * as a centered welcome modal, walks the lobby, has the user actually create
 * a room (interactive steps advance on the user's own action, not a Next
 * click), then continues inside the room. Skippable anywhere — but the skip
 * is deliberately quiet. No dependencies.
 *
 * Continuity across the lobby→room navigation: sessionStorage carries the
 * "live" flag; the room page resumes the same tour via <TourResume>.
 */

import { useEffect, useState } from 'react'

export type TourStep = {
  anchor: string
  title: string
  body: string
  /** Interactive step: no Next button — polls until the user's action makes this true. */
  advanceWhen?: () => boolean
}

const DONE_KEY = 'warroom-tour2'
const LIVE_KEY = 'warroom-tour-live'

function tourDone(): boolean {
  try {
    return !!localStorage.getItem(DONE_KEY)
  } catch {
    return true
  }
}
export function tourLive(): boolean {
  try {
    return sessionStorage.getItem(LIVE_KEY) === '1' && !tourDone()
  } catch {
    return false
  }
}
function markLive() {
  try {
    sessionStorage.setItem(LIVE_KEY, '1')
  } catch {
    /* fine */
  }
}
export function finishTour() {
  try {
    localStorage.setItem(DONE_KEY, 'done')
    sessionStorage.removeItem(LIVE_KEY)
  } catch {
    /* fine */
  }
}

export function Tour({ steps, onEnd }: { steps: TourStep[]; onEnd: () => void }) {
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = steps[idx]

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    // interactive steps re-measure + advance on the user's own action
    const id = setInterval(() => {
      measure()
      if (step.advanceWhen?.()) {
        if (idx < steps.length - 1) setIdx(idx + 1)
        else onEnd()
      }
    }, 250)
    return () => {
      window.removeEventListener('resize', measure)
      clearInterval(id)
    }
  }, [step, idx, steps.length, onEnd])

  // a missing anchor (e.g. facilitator-only button) skips forward
  useEffect(() => {
    if (!document.querySelector(`[data-tour="${step.anchor}"]`)) {
      if (idx < steps.length - 1) setIdx(idx + 1)
      else onEnd()
    }
  }, [step.anchor, idx, steps.length, onEnd])

  if (!rect) return null
  const below = rect.bottom + 200 < window.innerHeight
  const top = below ? rect.bottom + 12 : Math.max(12, rect.top - 190)
  const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - 340))

  return (
    // pointer-events-none overall: interactive steps NEED the page clickable
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <div
        className="absolute rounded-sm transition-all duration-300"
        style={{
          left: rect.left - 6,
          top: rect.top - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          boxShadow: '0 0 0 9999px rgba(10, 12, 10, 0.72)',
          border: '1px solid var(--color-primary)',
        }}
      />
      <div
        className="pointer-events-auto absolute w-80 rounded-sm border border-border bg-card p-4 shadow-[0_8px_30px_rgba(0,0,0,.5)] transition-all duration-300"
        style={{ top, left }}
      >
        <div className="wire text-[10px] text-primary">
          {idx + 1} / {steps.length} · {step.title}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={onEnd} className="wire text-[9px] text-chrome/50 hover:text-chrome">
            skip
          </button>
          {step.advanceWhen ? (
            <span className="wire flex items-center gap-1.5 text-chrome">
              <span className="breathe h-1.5 w-1.5 rounded-full bg-primary" />
              YOUR TURN
            </span>
          ) : (
            <button
              onClick={() => (idx < steps.length - 1 ? setIdx(idx + 1) : onEnd())}
              className="rounded-sm bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground"
            >
              {idx < steps.length - 1 ? 'Next' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Lobby entry point: a centered welcome modal (dim everything, big Start,
 * quiet skip). Also resumes a live tour if the user navigated back here.
 */
export function WalkthroughWelcome({ steps }: { steps: TourStep[] }) {
  const [state, setState] = useState<'ask' | 'running' | 'done'>(() =>
    tourDone() ? 'done' : tourLive() ? 'running' : 'ask',
  )
  if (state === 'done') return null
  if (state === 'running')
    // lobby leg ends when navigation unmounts us; the room leg resumes it.
    // Only an explicit skip (onEnd before navigation) finishes the tour here.
    return <Tour steps={steps} onEnd={() => (setState('done'), finishTour())} />
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-md rounded-sm border border-border bg-card p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,.6)]">
        <div className="wire text-chrome">WELCOME TO THE DESK</div>
        <div className="mt-3 font-serif text-3xl leading-tight text-foreground">
          Learn the room in 30 seconds.
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          A short walkthrough: open your first room, bring a document, decide, and leave with the
          record. You'll do the clicks — we'll point.
        </p>
        <button
          onClick={() => {
            markLive()
            setState('running')
          }}
          className="mt-6 w-full rounded-sm bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:brightness-110"
        >
          Start the walkthrough
        </button>
        <button
          onClick={() => {
            setState('done')
            finishTour()
          }}
          className="wire mt-3 text-[9px] text-chrome/50 hover:text-chrome"
        >
          skip for now
        </button>
      </div>
    </div>
  )
}

/** Room leg: silently continues a live tour; renders nothing otherwise. */
export function TourResume({ steps }: { steps: TourStep[] }) {
  const [active, setActive] = useState(() => tourLive())
  if (!active) return null
  return (
    <Tour
      steps={steps}
      onEnd={() => {
        setActive(false)
        finishTour()
      }}
    />
  )
}
