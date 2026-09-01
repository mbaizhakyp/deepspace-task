# Warroom — submission note

**Live:** https://warroomhq.app.space
**Repo:** github.com/mbaizhakyp/deepspace-task (app in `warroom/`; process docs in `docs/`)

Sixty-second demo: sign in → open a room → IMPORT → paste any text (messy notes work best) → watch cards land → open a poll → Summarize. Two browser windows on the same room link is the full effect.

## What it is

A war room, not a call. Import a document — tidy or messy — and it lands on a shared board as live cards. The team triages together (presence cursors, realtime drag, a pannable/zoomable board that each person frames for themselves), contested points get settled by live polls (one vote per person, enforced by the database), the facilitator can freeze the whole room server-side, and the meeting ends with an AI-written dispatch ("What was decided") exported as Markdown. The meeting is the artifact.

Best demo: open the room in two browser windows as two users. Vote in one, watch the bar move in the other; freeze in one, watch the other lock.

## Platform capabilities used (7)

1. **Auth** — gated app; static landing, everything else behind sign-in.
2. **Realtime records** — cards, polls, votes, settings, wire-log events; per-board Durable Object rooms (`board:<id>`), app scope holds the registry.
3. **Permissions, actually gating** — three layers, each with an adversarial proof, not just a disabled button:
   - collection RBAC: votes are unforgeable (server-stamped `userBound` voterId, `uniqueOn` one-per-poll at the DB, revote = `update: 'own'`); card deletion is `'own'` and the UI mirrors it;
   - a membership gate at the WebSocket route — non-members get 403 before reaching a board's DO (records, presence, AND job-progress streams);
   - time-varying rules RBAC can't express live in the DO's message boundary: facilitator **freeze**, votes on **decided polls** rejected, and poll lifecycle (creator/facilitator close; **only the facilitator reopens** — decided means decided).
   The two-user Playwright spec attacks all of it: it pushes raw mutations through a frozen user's live socket, fires late votes and forged reopens at a decided poll, and asserts the server bounces each one — then proves the same writes land when legitimate. Access model, stated plainly: rooms are **shareable-link** scoped (any signed-in user with the URL joins, like a link-shared doc); the gates above are about what members can DO, not about hiding the link.
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

Verification was deliberate and adversarial, and it caught real bugs the demo never would:

- **B-003:** every server action silently failed on first live run — `getAuthToken()` returns a Promise and was used synchronously (`Bearer [object Promise]`). Caught by the first E2E run, not by the type checker.
- **B-004, the important one:** the freeze looked perfect in the UI but was **not server-enforced** — the DO decided "am I a board?" from its first fetch URL, and a new board's first fetch is an internal action call, so enforcement never armed. Caught only because the test spec deliberately pushes a raw mutation through the frozen user's live socket, past the disabled buttons. Fixed by deriving board-ness from the room's own data.
- **B-002:** Google Docs import failed live with "document came back empty"; a shape-reporting error message turned one user retry into a one-line fix (the doc resource arrives at the top level of the integration result, not under `.data`).
- **B-005:** a reported "duplicated room" was investigated with three failed reproduction attempts, then proven to be two legitimately same-named rooms with zero lobby disambiguation — a UI defect, fixed with facilitator + date labels.
- **B-006:** an external review pass flagged that decided polls were quietly mutable server-side (late votes, member reopens). Fixed with two more message-boundary guards; the regression spec's first run then forced a real product decision (may a creator reopen their own decided poll? No — decided means decided).

Full history: `docs/BUGLOG.md` (B-001…B-006, D-001…D-016). Final state: 10 unit tests + 11 Playwright tests green, plus a scripted end-to-end run against production (sign-in → room → real AI import of 9 cards → poll → vote → summary) with screenshots in `docs/screenshots/`.

**Hours, honestly:** ~9h total across two days — ~1h research/planning, ~3h building all stages compile-only (blocked on an app-quota decision), ~1.5h runtime verification and the B-003/B-004 fixes, ~1h deploy + production E2E + demo seed, ~2.5h post-ship fixes driven by real usage (audit logging, room deletion, B-002/B-005/B-006). Cut when the box pressed: Yjs minutes pane, export-back-to-Docs, AI chat panel, per-account import metering.

## Honest edges / what I'd do next

- **Google Docs OAuth**: implemented, not live-verified (Composio tool slugs flagged for runtime check, B-002). Next session: one consent click + slug verification.
- **Stripe Connect onboarding** not completed, so checkout returns the platform's `owner_connect_not_ready` — the server-side gate is enforced regardless.
- Next features, in order: source-panel "highlight → extract to card" for messy docs; export the dispatch back to a new Google Doc over the same Composio connection; AI chat grounded in the imported doc.
- Known ceilings are marked with `ponytail:` comments in code (e.g., per-mutation freeze SQL read; per-room rather than per-user import quota).
