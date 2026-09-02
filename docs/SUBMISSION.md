# Warroom — submission note

**Live:** https://warroomhq.app.space
**Repo:** github.com/mbaizhakyp/deepspace-task (app in `warroom/`; process docs in `docs/`)

Sixty-second demo: sign in → take the built-in 30-second walkthrough (it has you create a room and shows every control with recorded demo clips) → IMPORT (browse your Google Docs, or paste messy notes) → watch cards land and the camera center on them → open a poll → Summarize. Two browser windows on the same room code is the full effect.

## What it is

A war room, not a call. Import documents — from your Google Drive or pasted, tidy or messy — and they land on a shared board as live cards, each import batch on its own paper stock. The team triages together (presence cursors, realtime drag, marquee multi-select with group moves, an unlimited pannable/zoomable board each person frames for themselves), contested points get settled by live polls (one vote per person, enforced by the database; the card turns green when everyone has voted), the facilitator can freeze the whole room server-side, and the meeting ends with an AI-written dispatch ("What was decided") — with full dispatch history, exportable as Markdown or PDF. Rooms are joined by link or by a short WR- code. The meeting is the artifact.

## Platform capabilities used (8)

1. **Auth** — gated app; static landing, everything else behind sign-in.
2. **Realtime records** — cards, polls, votes, settings, summaries, wire-log events; per-board Durable Object rooms (`board:<id>`), app scope holds the registry.
3. **Permissions, actually gating** — three layers, each with an adversarial proof, not just a disabled button:
   - collection RBAC: votes are unforgeable (server-stamped `userBound` voterId, `uniqueOn` one-per-poll at the DB, revote = `update: 'own'`);
   - a membership gate at the WebSocket route — non-members get 403 before reaching a board's DO (records, presence, AND job-progress streams);
   - time-varying rules RBAC can't express live in the DO's message boundary: facilitator **freeze**, votes on **decided polls** rejected, poll lifecycle (only the facilitator reopens a decided poll), poll deletion (creator or facilitator).
   The two-user Playwright spec attacks all of it: raw mutations through a frozen user's live socket, late votes and forged reopens at a decided poll — asserting the server bounces each one, then that the same writes land when legitimate. Access model, stated plainly: rooms are **shareable-link/code** scoped (any signed-in user who has either joins, like a link-shared doc); the gates are about what members can DO.
4. **Presence** — live named cursors, roster popover (facilitator starred, online dots), online-vs-member counts.
5. **Background jobs** — imports run in the platform JobRoom; progress streams to every member; multi-document runs queue one job per doc and report `x + y + z = total`; a hung job is failed by a server-side timeout AND the panel has independent stuck-detection.
6. **AI integration** — segmentation (by idea, not headings — messy docs work) and the summary dispatch via the platform's Anthropic integration; developer-billed; re-summarize is gated on a board *fingerprint* (unchanged board = no AI call), not a timer.
7. **Composio per-user OAuth** — Google Docs import as yourself: browse-and-multi-select your own docs (tool slugs verified against prod via a built-in discovery mode, response shapes learned from data after a live failure — B-002, user-confirmed fixed). Live-verified end to end with a real Google consent.
8. **Payments** — Pro plan synced to Stripe, monthly and yearly prices, live checkout (verified reaching checkout.stripe.com); free tier = 3 rooms + 3 imports/room, both enforced server-side (a forged client enqueue still hits the quota in the job handler).

## The main tradeoff

**No video/audio, on purpose.** LiveKit was available, but it's metered billing, miserable to verify, and it would make the app compete with Zoom on Zoom's terms. Presence + live cursors carry the "we're together" feeling; the product competes with the follow-up email nobody writes, not with the call. The freed hours went into making enforcement real (B-004 below) instead of making a call work.

A second deliberate cut: no Yjs collaborative text editor — card-level editing is already collaborative via record sync; a document editor is a product of its own.

## What the agent did vs. what was verified

The agent (Claude Code) researched the SDK from its installed types and docs, planned in stages (`docs/PLAN.md`), wrote effectively all code, and kept a decision/bug ledger at the moment things happened, not retroactively: `docs/BUGLOG.md` (**B-001…B-021, D-001…D-051**) with a curated architecture record in `docs/DECISIONS.md`. Every stage/fix is its own commit. After the initial build, the product went through ~17 rounds of my live testing and outside feedback; every reported symptom was root-caused, logged, fixed, and re-verified against production (screenshots in `docs/screenshots/`).

Verification was deliberate and adversarial, and it kept catching bugs the demo never would:

- **B-004, the important one:** the freeze looked perfect in the UI but was **not server-enforced** — the DO decided "am I a board?" from its first fetch URL, which for a new board is an internal action call, so enforcement never armed. Caught only because the spec pushes a raw mutation through the frozen user's live socket, past the disabled buttons.
- **B-003:** every server action silently failed on first live run — `getAuthToken()` used synchronously sent `Bearer [object Promise]`. Caught by E2E, invisible to the type checker.
- **B-002:** Google Docs import failed live; a shape-reporting error message (keys only, never content) turned one user retry into a one-line fix, and grew into a discovery-first rule: never trust a guessed API shape.
- **B-015:** after leaving a room, its row lingered — leaving revokes your read access, so the server *can't* push the membership update to you. Scoped-subscription staleness, found by a focused two-user test, invisible to happy paths.
- **B-017:** re-summarize was refused after a changed vote — the AI-cost guard measured *time* when it should measure *sameness*; replaced with a board fingerprint.
- **B-019:** an import stuck at "READING & SEGMENTING" forever — the AI call had no timeout, so a hang left a zombie `running` job. Fixed server-side (deadline → honest failure) and client-side (independent stuck-detection), because one layer of defense had already proven insufficient.

Final state: **21 unit tests + 11 Playwright tests green**, plus scripted production runs for every shipped round (real AI imports, two-user vote/freeze/join-by-code flows, checkout probes stopping at checkout.stripe.com).

**Hours, honestly:** ~9h for the initial build across two days (research → staged build → adversarial verification → deploy), then roughly another ~8h of feedback-driven iteration over the following days — features (camera, room codes, walkthrough with recorded demo clips, day/night editions, dispatch history, marquee select) and the bug hunts above. Cut when the box pressed: Yjs minutes pane, export-back-to-Docs, AI chat panel.

## Honest edges / what I'd do next

- The poll-delete guard's deny path (a member who is neither creator nor facilitator) mirrors the adversarially-tested lifecycle guard but isn't itself raw-tested — it needs a third test account; noted, not faked.
- The day theme deviates from the design brief's "dark, always" — a deliberate user-override, logged (D-027).
- Next features, in order: export the dispatch back to a new Google Doc over the same Composio connection; source-panel "highlight → extract to card" for messy docs; AI chat grounded in the imported doc.
- Known ceilings are marked with `ponytail:` comments in code (e.g., per-mutation freeze SQL read; linear room-code scan).
