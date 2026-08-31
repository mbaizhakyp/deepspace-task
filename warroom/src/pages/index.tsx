/**
 * Landing — a STATIC page (no auth fetch, no records WebSocket).
 * One screen, per design-brief.md: serif headline, the three-step loop
 * in mono, one orange CTA. The live app lives behind /rooms.
 */

import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <div
      data-testid="static-landing"
      className="dotgrid flex min-h-screen flex-col items-center justify-center px-6 text-center"
    >
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
  )
}
