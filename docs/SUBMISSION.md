# Warroom — submission note

**Live:** https://warroomhq.app.space
**Demo room (join as any signed-in user):** https://warroomhq.app.space/room/1788143028086_ncph5b
**Repo:** github.com/mbaizhakyp/deepspace-task (app in `warroom/`; process docs in `docs/`)

## What it is

A war room, not a call. Import a document — tidy or messy — and it lands on a shared board as live cards. The team triages together (presence cursors, realtime drag), contested points get settled by live polls (one vote per person, enforced by the database), the facilitator can freeze the whole room server-side, and the meeting ends with an AI-written dispatch ("What was decided") exported as Markdown. The meeting is the artifact.

Best demo: open the room in two browser windows as two users. Vote in one, watch the bar move in the other; freeze in one, watch the other lock.

## Platform capabilities used (7)

1. **Auth** — gated app; static landing, everything else behind sign-in.
2. **Realtime records** — cards, polls, votes, settings, wire-log events; per-board Durable Object rooms (`board:<id>`), app scope holds the registry.
3. **Permissions, actually gating** — three layers: collection RBAC (votes: `update: 'own'` + `uniqueOn` + `userBound`), a membership gate at the WebSocket route (non-members get 403 before reaching a board's DO), and the facilitator freeze enforced in the DO's message handler — a raw socket mutation from a frozen user is rejected server-side (there's a Playwright spec that proves exactly this).
4. **Presence** — live named cursors + roster.
5. **Background jobs** — imports run in the platform JobRoom; progress streams to every room member over WS while cards land one by one.
6. **AI integration** — segmentation (by idea, not headings — messy docs work) and the summary dispatch, via the platform's Anthropic integration; developer-billed, rate-limited.
7. **Payments** — Pro plan synced to Stripe; free tier = 3 imports/room enforced server-side (a forged client enqueue still hits the quota in the job handler). Checkout is live pending Stripe Connect onboarding.

Plus **Composio per-user OAuth** for Google Docs import (paste a doc URL, approve access, import as yourself) — code-complete with the `requiresConnection` dance; the live OAuth round-trip is the one path not yet verified end-to-end (needs a real Google consent).

## The main tradeoff

**No video/audio, on purpose.** LiveKit was available, but it's metered billing, miserable to verify, and it would make the app compete with Zoom on Zoom's terms. Presence + live cursors carry the "we're together" feeling; the product competes with the follow-up email nobody writes, not with the call. The freed hours went into making enforcement real (see B-004 below) instead of making a call work.

A second deliberate cut: no Yjs collaborative text editor — card-level editing is already collaborative via record sync; a document editor is a product of its own.

## What the agent did vs. what was verified

The agent (Claude Code) researched the SDK from its installed types and docs, planned in stages (`docs/PLAN.md`), wrote effectively all code, and kept a decision/bug ledger (`docs/BUGLOG.md`, D-001…D-014, B-001…B-004). Every stage is one commit.

Verification was deliberate and adversarial, and it paid for itself twice:

- **B-003:** every server action silently failed on first live run — `getAuthToken()` returns a Promise and was used synchronously (`Bearer [object Promise]`). Caught by the first E2E run, not by the type checker.
- **B-004, the important one:** the freeze looked perfect in the UI but was **not server-enforced** — the DO decided "am I a board?" from its first fetch URL, and a new board's first fetch is an internal action call, so enforcement never armed. Caught only because the test spec deliberately pushes a raw mutation through the frozen user's live socket, past the disabled buttons. Fixed by deriving board-ness from the room's own data.

Final state: 8 unit tests + 11 Playwright tests green (including the two-user freeze-enforcement spec), plus a scripted end-to-end run against production (sign-in → room → real AI import of 9 cards → poll → vote → summary) with screenshots in `docs/screenshots/`.

## Honest edges / what I'd do next

- **Google Docs OAuth**: implemented, not live-verified (Composio tool slugs flagged for runtime check, B-002). Next session: one consent click + slug verification.
- **Stripe Connect onboarding** not completed, so checkout returns the platform's `owner_connect_not_ready` — the server-side gate is enforced regardless.
- Next features, in order: source-panel "highlight → extract to card" for messy docs; export the dispatch back to a new Google Doc over the same Composio connection; AI chat grounded in the imported doc.
- Known ceilings are marked with `ponytail:` comments in code (e.g., per-mutation freeze SQL read; per-room rather than per-user import quota).
