/**
 * Pricing — two paper cards on the dark ground. Checkout runs through the
 * platform's Stripe integration (useSubscription); until the app owner
 * completes Connect onboarding, subscribe() fails with owner_connect_not_ready
 * and we say so honestly.
 */

import { useState } from 'react'
import { useSubscription } from 'deepspace'

export default function PricingPage() {
  const sub = useSubscription()
  const [error, setError] = useState<string | null>(null)
  const isPro = sub.tier === 'pro' && sub.entitled

  async function subscribe() {
    setError(null)
    try {
      // opens Stripe Checkout in this tab
      await sub.subscribe('pro')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'checkout failed')
    }
  }

  async function portal() {
    setError(null)
    try {
      await sub.openPortal()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'portal failed')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="wire text-chrome">PRICING</div>
      <h1 className="mt-1 font-serif text-4xl text-foreground">One decision, easy to make.</h1>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-sm bg-paper p-7">
          <div className="wire text-[10px] text-ink-muted">FREE</div>
          <div className="mt-1 font-serif text-3xl text-ink">$0</div>
          <ul className="wire mt-5 flex flex-col gap-2 text-[11px] text-ink-muted">
            <li>UNLIMITED ROOMS &amp; MEMBERS</li>
            <li>LIVE BOARD · POLLS · FREEZE</li>
            <li>3 IMPORTS PER ROOM</li>
            <li>AI SUMMARY &amp; EXPORT</li>
          </ul>
          <div className="mt-6 text-[13px] text-ink-muted">
            {isPro ? 'Your rooms started here.' : 'You are on Free.'}
          </div>
        </div>

        <div className="rounded-sm border border-signal bg-paper p-7">
          <div className="wire text-[10px] text-signal">PRO</div>
          <div className="mt-1 font-serif text-3xl text-ink">
            $9<span className="text-lg text-ink-muted">/mo</span>
          </div>
          <ul className="wire mt-5 flex flex-col gap-2 text-[11px] text-ink-muted">
            <li>EVERYTHING IN FREE</li>
            <li className="text-ink">UNLIMITED IMPORTS</li>
            <li>$90/YEAR IF PAID YEARLY</li>
          </ul>
          {isPro ? (
            <button onClick={portal} className="mt-6 rounded-sm border border-ink/20 px-4 py-2.5 text-[13px] font-semibold text-ink">
              Manage billing
            </button>
          ) : (
            <button
              onClick={subscribe}
              disabled={sub.isLoading}
              className="mt-6 rounded-sm bg-signal px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50"
            >
              Go Pro
            </button>
          )}
        </div>
      </div>

      {(error || sub.error) && (
        <div className="wire mt-6 text-warnamber">
          {(error ?? sub.error ?? '').toUpperCase().slice(0, 120)}
        </div>
      )}
    </div>
  )
}
