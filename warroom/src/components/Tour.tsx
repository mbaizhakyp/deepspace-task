/**
 * Walkthrough (D-045) — a dependency-free spotlight tour. Each step anchors
 * to a `data-tour` element: the page dims, the target keeps its light (a
 * box-shadow cutout), and a wire-styled callout explains it. Offered once
 * per surface (localStorage), always skippable, relaunchable from the offer.
 */

import { useEffect, useState } from 'react'

export type TourStep = { anchor: string; title: string; body: string }

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
    return () => window.removeEventListener('resize', measure)
  }, [step.anchor])

  // a missing anchor (e.g. facilitator-only button) just skips forward
  useEffect(() => {
    if (rect === null) {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`)
      if (!el) {
        if (idx < steps.length - 1) setIdx(idx + 1)
        else onEnd()
      }
    }
  }, [rect, idx, step.anchor, steps.length, onEnd])

  if (!rect) return null
  const below = rect.bottom + 190 < window.innerHeight
  const top = below ? rect.bottom + 12 : Math.max(12, rect.top - 180)
  const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - 340))

  return (
    <div className="fixed inset-0 z-[90]">
      {/* spotlight: the dim is the cutout's shadow */}
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
        className="absolute w-80 rounded-sm border border-border bg-card p-4 shadow-[0_8px_30px_rgba(0,0,0,.5)] transition-all duration-300"
        style={{ top, left }}
      >
        <div className="wire text-[10px] text-primary">
          {idx + 1} / {steps.length} · {step.title}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={onEnd} className="wire text-chrome hover:text-foreground">
            SKIP TOUR
          </button>
          <button
            onClick={() => (idx < steps.length - 1 ? setIdx(idx + 1) : onEnd())}
            className="rounded-sm bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground"
          >
            {idx < steps.length - 1 ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Once-per-surface offer chip. Renders nothing after a choice is stored. */
export function TourOffer({
  storageKey,
  label,
  steps,
}: {
  storageKey: string
  label: string
  steps: TourStep[]
}) {
  const [state, setState] = useState<'offer' | 'running' | 'done'>(() => {
    try {
      return localStorage.getItem(storageKey) ? 'done' : 'offer'
    } catch {
      return 'done'
    }
  })
  function finish() {
    try {
      localStorage.setItem(storageKey, 'done')
    } catch {
      /* private window: the offer just reappears next visit */
    }
    setState('done')
  }
  if (state === 'done') return null
  if (state === 'running') return <Tour steps={steps} onEnd={finish} />
  return (
    <div className="wire fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-sm border border-border bg-card px-4 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,.4)]">
      <span className="breathe h-1.5 w-1.5 rounded-full bg-live" />
      <span className="text-chrome">{label}</span>
      <button onClick={() => setState('running')} className="text-primary hover:underline">
        TAKE THE TOUR
      </button>
      <button onClick={finish} className="text-chrome/60 hover:text-foreground">
        SKIP
      </button>
    </div>
  )
}
