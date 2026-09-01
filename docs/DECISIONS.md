# Warroom — Decision Record

A curated record of the architectural, security, and product decisions behind Warroom,
written to be talked through. Each entry: what we chose, why, and what it beat. The full
chronological log (with the bugs that motivated many of these) lives in `BUGLOG.md` —
IDs here (D-###, B-###) point into it.

This document is **committed, not gitignored** (a decision itself): the evaluation
explicitly asks how decisions were made, so the record is part of the deliverable.

---

## Architecture

**Per-board Durable Object rooms; app scope holds only the registry.** (D-007)
Each board is its own record room (`board:<id>`) with its own cards/polls/votes/events.
Why: room-scoped access means "user A provably cannot read board B" comes from the
platform, not from hand-written filters; a hot board is its own DO, not a shard of one.
Beat: one shared scope with a boardId column — a single DO hotspot plus permission
filtering we'd have to write and could get wrong.

**Time-varying rules live at the DO message boundary, not in RBAC.** (D-008, B-004, B-006, D-026)
RBAC schemas express static rules (`delete: 'own'`, `userBound`, `uniqueOn`). Freeze,
"no votes on decided polls", "only the facilitator reopens a decided poll", and
"creator-or-facilitator deletes a poll" are *stateful* rules — they depend on the current
board. They're enforced in `webSocketMessage` on the DO: every raw socket write passes
the guards or gets a failed ack. The UI disabling buttons is presentation, never the
security boundary.

**Server actions are the only writers of privileged state.** (rooms registry, freeze, membership)
Clients can't update the `rooms` collection at all; create/join/leave/delete/freeze go
through RBAC-off server actions that re-derive identity from the verified JWT and
authorize against the room record explicitly. One choke point per mutation type.

**Background import is a durable job with a forgery-proof quota.** (D-014)
Imports run in the board's JobRoom (survives tab close, retries, streams progress to the
whole room). The quota/tier check happens *in the job handler*, keyed off `enqueuedBy` —
which only the server can stamp. A `verified:` marker distinguishes action-checked
enqueues from raw WS enqueues, so a forged client enqueue still hits the free quota.
Beat: gating at enqueue time only — the WS enqueue path would have stayed open.

**The audit trail is a wrapper, not a discipline.** (D-015)
Every server action and job runs inside one wrapper that logs actor/kind/outcome (with
all strings truncated — never document content) to an admin-only collection. Because
it's structural, B-002 and B-005 were diagnosed from data instead of guesses.

**The board camera is local state; records hold world coordinates.** (D-022, D-024)
Pan/zoom is per-viewer — two people frame the same board differently while dragging the
same cards; cursors sync in world coords so they stay glued to content under any camera.
The canvas is unlimited; the escape hatch is fit-all RESET, not world walls (a reversal
of the first bounded design, made when fit-all landed — logged as such).

## Integrations & external effects

**Discovery-first integration: never trust a guessed API shape.** (B-002, D-020)
The Composio slugs and response shapes were verified against production via a built-in
discovery mode (`list-tools`) before the picker shipped; response parsers walk for the
data instead of betting on one nesting, and every failure path returns the *shape* of
what came back (keys only, no content) so the next fix starts from evidence.

**Risk-ordered build: pure code first, OAuth last.** (D-002)
Summary/export/payments compile-verify without external state; Google Docs needs live
discovery plus the user's real consent. Stages were ordered so the unverifiable-in-dev
part landed when there was a working app around it.

**AI output crosses a parsing seam, and the seam is unit-tested.** Segmentation and
summary responses go through tolerant extractors (`extractJsonArray`, `parseSummary`)
that survive fences, prose, and junk — the tests pin the real shapes that came back,
including the exact B-002 regression payload.

## Product / UX

**No deletion popups — inline two-step arm.** (D-019) DELETE → SURE? with a 2.5s
disarm, used for rooms (lobby and in-room), polls, leave-room. User preference,
applied everywhere destructive.

**Progress UIs bind to real signals or admit they don't.** (D-018, D-023, B-012)
The import journey's checkmarks map to observable boundaries (action in flight, job
status, the reading/cards progress split, terminal state). The summary's stages are
elapsed-time and the code says so — staged honesty beat fake percentages. The all-green
flash (B-012) was fixed by refusing to render a previous job's state as the new one's.

**One orange ask; differentiation by shape, not color.** (design brief, D-025)
The toolbar got line glyphs and hairline grouping because the palette allows exactly one
orange attention point and bans emoji in chrome. Identity constraints are treated as
constraints, not suggestions.

**The camera never moves under a busy hand.** (D-023) Import-landed centering skips
anyone mid-drag or mid-pan and only fires on an observed finish transition — walking
into a room later never yanks the view.

**Honest labels over theater.** Delete buttons only render where the server would allow
the delete (B-006 follow-up); the pricing page reflects what's implemented, not the
brief's sketch; Stripe checkout reports the platform's real `owner_connect_not_ready`
state instead of pretending.

## Process

**Bug log first, fix second.** Every bug gets its entry (symptom, hypothesis) at the
moment it's hit, closed with root cause + how it was verified. The log is the raw
material for this document.

**Adversarial verification for every server rule.** The Playwright spec pushes raw
mutations through a real authenticated socket *past disabled UI* — that spec, not the
happy path, caught B-004 (freeze that looked enforced but wasn't) and shaped B-006.

**Commits are stage markers; deviations are logged, not hidden.** One commit per
completed task; reversals (bounded → unlimited canvas) and brief deviations (day theme
vs. "dark always") are recorded with their reasons.
