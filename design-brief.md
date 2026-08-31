# Design Brief: Warroom

> Working name: **Warroom** (alternates: *Dispatch*, *Tabletop*)

## 1. What the product is

Warroom is a persistent collaborative war room — a shared board where a remote team imports a real document (from Google Docs), works on it together live (cards, cursors, presence), decides things (live polls), controls the session (a facilitator can freeze participants), and leaves with an artifact (an AI summary exported back to Docs). The one-line positioning: **"A war room, not a call. The meeting is the artifact."** It is explicitly *not* Zoom and *not* Miro: no video, no infinite toolbox — one room, one purpose, decisions that persist.

## 2. The spirit: "Newsroom wire terminal"

The design metaphor is a **modern newswire / mission-control terminal**: a calm, dark operations room where light-colored paper documents are the objects of attention. Everything on screen is either **chrome** (the room: dark, quiet, technical, monospaced telemetry) or **artifact** (the content: warm paper cards, serif headlines, the things that will outlive the meeting). This tension — cold terminal holding warm paper — IS the brand. Decisions are treated like wire dispatches: timestamped, attributed, final.

Five personality words: **deliberate, warm-blooded, technical, editorial, unhurried.**
Anti-personality: playful-startup, corporate-SaaS, gamer-RGB, glassy-futuristic.

## 3. Color system (exact values)

**Chrome (the room) — dark, always:**
- Ground: `#101210` (near-black with a green undertone — an ops room, not a void)
- Raised surfaces / panels: `#191C19`
- Hairlines & grid: `#2A2E2A`
- Chrome text: `#9BA59B` (secondary), `#E6EAE4` (primary)

**Artifact (the content) — warm paper:**
- Card face: `#F4F1E8` (cream, never pure white)
- Card ink: `#1A1A16`
- Card meta text: `#6E6A5E`

**Signals (use sparingly — signals, not decoration):**
- Live / presence / sync: `#4ADE80` (phosphor green — the "system is alive" color; presence dots, live cursors' default, sync ticks)
- Action / accent: `#E8641B` (international orange — buttons, poll bars, the FREEZE state, anything that means "something is being decided"). This is the brand accent. One accent. No purple, no gradient.
- Danger only: `#E5484D`. Warning only: `#E8A33D`.
- Per-user cursor/avatar colors: 6 muted-but-distinct hues (`#5B9BD5 #D57A9B #7FB069 #C9A227 #9B7ED9 #D5825B`) — desaturated so they never fight the orange.

Rule: the board ground is dark, cards are cream, and at any moment there should be at most **one** orange thing asking for attention.

## 4. Typography

- **Display / headlines / card titles: "Instrument Serif"** (fallback: Lora) — the editorial voice; this is what makes it non-generic. Room names and the big summary headline are serif, large, tight.
- **UI / body: "Inter"** — quiet, invisible, does the work.
- **Telemetry: "IBM Plex Mono"** — timestamps, vote counts, progress lines, presence counts, keyboard hints, the import log. Everything that is *the system speaking* is mono, uppercase, letter-spaced (`11px, tracking 0.08em`, chrome-secondary color). Examples: `IMPORTING · 14/32 SECTIONS · 00:41`, `POLL CLOSES IN 00:19`, `FROZEN BY MAYA · 14:32`.

This three-voice system (serif = artifact, sans = interface, mono = machine) must be applied with total consistency — it is the core stylistic idea.

## 5. Shape, texture, depth

- Corners: **4px** on cards and buttons, **8px** max on panels. Nothing pill-shaped except avatars.
- The board ground has a **subtle dot grid** (`#2A2E2A` dots, 24px spacing) — drafting table, not notebook.
- Depth comes from **1px hairline borders + very tight shadows** (`0 1px 2px rgba(0,0,0,.5)` on dark; `0 2px 6px rgba(26,26,22,.18)` under paper cards so they feel physically laid on the table). **No glassmorphism, no blur, no glow, no large soft shadows.**
- Cards may be very slightly rotated (±0.5°) when freshly imported, straightening when a human touches them — paper landing on a table. Subtle; a detail people feel rather than see.

## 6. Screens to design (in priority order)

1. **The Room (core screen).** Dark dot-grid board filling the viewport. Cream cards arranged on it. Top bar: room name in serif (left), presence avatar stack + mono `4 PRESENT` (center-right), facilitator lock toggle + "Summarize" button (right, orange). Bottom-left: a small mono **wire log** (`14:02 MAYA IMPORTED 'Q3 PLAN' · 14:09 POLL OPENED`) — the meeting writing its own record in real time; this element is a signature. Live cursors with small name tags in user colors.
2. **Import flow.** A panel (not a modal-on-modal): connect Google state → doc picker → then the money shot: a mono progress line streams (`SECTION 7/23 · "PRICING" · OK`) while cards visibly land on the board behind it one by one. Design the mid-import moment.
3. **Poll card.** A cream card, question in serif, options with **orange horizontal bars that fill live**, mono vote counts, mono countdown. Voted state: your choice ticked, bar animation settling. Closed state: winning option's bar stays orange, others fade to chrome-gray — the poll becomes a permanent artifact on the board.
4. **Frozen state.** When the facilitator freezes the room: board dims ~20%, a thin orange border draws around the entire viewport, mono banner top-center: `BOARD FROZEN BY MAYA`. Participants' cursors still visible but drag attempts produce a small "locked" shake. Design frozen vs. active side by side.
5. **Summary / export.** The AI summary as a full-height cream sheet sliding from the right — serif headline "What was decided," decisions listed with mono timestamps and vote results, orange "Send to Google Docs" button. It should look like a printed dispatch.
6. **Landing page.** Dark, one screen: serif headline ("The meeting is the artifact."), a live-looking product shot of the Room, one orange CTA. Mono strip of the three-step loop: `IMPORT → DECIDE → EXPORT`. No feature grid of twelve icons, no testimonials, no gradient hero.
7. **Pricing.** Two cream cards on dark: Free (`3 IMPORTS · 1 ROOM`) / Pro. Mono feature lines. Quietly confident, no "MOST POPULAR" ribbon.

## 7. Motion principles

- Realtime changes (cards moving, votes arriving, cursors) are **immediate, 120–180ms ease-out** — the room must feel live, never animated for its own sake.
- Imported cards **drop in** (fall 8px + settle, slight rotation) staggered ~80ms apart — the signature moment of the product.
- Poll bars move with a slight spring. The freeze border **draws** around the viewport in ~300ms.
- Nothing loops, pulses, or floats idle except presence dots (slow 3s breathing) and the wire log's new-line tick.

## 8. Voice (microcopy)

System speaks in mono, terse, uppercase, factual: `SAVED`, `2 PRESENT`, `EXPORTED 14:32`. Human-facing copy is lowercase, calm, slightly dry: "Nothing here yet. Import a doc or add a card." Never exclamation marks, never "Oops!", never "Awesome!". Empty states and errors stay in character: `CONNECTION LOST · RECONNECTING` beats a sad-face illustration.

## 9. Hard don'ts (anti-generic guardrails)

No purple/violet, no gradients, no glassmorphism, no emoji in UI chrome, no rounded-pill buttons, no illustration-of-people-collaborating, no confetti, no Inter-for-everything, no pure white, no pure black, no floating 3D blobs, no dashboard-with-sidebar layout for the room (the board IS the screen).

## 10. Practical constraints

Must be buildable in Tailwind v4 + shadcn-style primitives within a day — so: standard flex/grid layouts, CSS transforms for motion, no WebGL, no custom canvas rendering for chrome elements. Desktop-first (the demo is two side-by-side browser windows); must remain legible at half-screen width. WCAG AA contrast on all text (the cream-on-dark and ink-on-cream pairs above pass; verify signal colors on both grounds).

---

**The one idea to protect above all others:** dark terminal chrome + warm paper artifacts + the three-voice typography. Everything else is negotiable; that is the spirit.
