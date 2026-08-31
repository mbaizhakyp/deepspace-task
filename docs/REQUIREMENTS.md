# Warroom — Requirements

One-liner: **a persistent collaborative war room — import a doc, argue over it as live cards, decide with polls, leave with an exported record.** Not Zoom (no calls — presence gives togetherness), not Miro (no infinite toolbox — one room, one purpose).

Evaluation context: DeepSpace hiring exercise (`task.txt`). Scored on: timebox judgment, working core path, ≥3 SDK capabilities with permissions actually gating access, understandable code, protected secrets, honest writeup. Originality not scored.

## User journeys (defended in conversation, 2026-08-30)

1. **Sprint planning (flagship demo):** import planning doc → team triages cards live → contested items settled by poll → freeze → AI summary → export. Outcome: a decided, documented plan.
2. **Paid workshop:** facilitator imports exercise brief; brainstorm phase (all edit) vs discussion phase (frozen); dot-vote; board is the client deliverable. Justifies freeze + payments.
3. **Spec review:** sections triaged into fine/concerns/blocking; AI chat answers "what does section N say" for non-readers; verdict poll. Justifies AI chat.
4. **Async decision:** poll + objection cards across timezones; no meeting occurs. Free consequence of persistence; writeup material, not demo.

## Functional requirements

### Must have (core path — demo dies without these)
- **Auth**: gated app; sign in required for rooms. Public landing page.
- **Rooms**: create room; my-rooms list (lobby); join via shareable link `/room/:id`. Creator = facilitator; joiners = editor by default.
- **Board**: cards on a positioned canvas (dot grid); create/edit/move/delete; realtime sync across clients; card carries title, body, position, author, origin (imported/added), timestamps.
- **Presence**: who's here (avatar stack + count) and live named cursors.
- **Polls**: create poll card (question + 2–4 options); live vote bars; **one vote per user enforced by deterministic vote record id `pollId:userId`** (revote overwrites); creator closes poll; closed poll persists as artifact showing result.
- **Facilitator freeze**: facilitator toggles room freeze → all non-facilitator members become read-only, **enforced server-side** (member role flip via server action; prior role stored for unfreeze). UI: dimmed board, orange border, `BOARD FROZEN BY <NAME>` banner, disabled controls.
- **Import v1 — paste text**: paste any text → server action + AI segments it into titled cards (headings are a hint, not a requirement) → cards land on board. Import mode choice: "everything as cards" vs "key points only".
- **Import as background job with live progress**: job writes progress into a synced record; progress panel + cards appearing live for all room members; partial failure keeps completed cards and reports error.
- **AI summary**: one action → decisions + poll results + key cards → dispatch panel ("What was decided"), export as Markdown download.
- **Permissions matrix** (collection-level, server-evaluated; final shipped rules): members create anything, edit/move any card or poll (triage together is the product), delete only their own; votes are unforgeable (server-stamped voterId, one per user at the DB, revote = update own); poll lifecycle is guarded in the DO — creator or facilitator closes an open poll, only the facilitator reopens a decided one, and votes on decided polls are rejected; frozen users cannot write at all, votes included (freeze means freeze).
- **Access model is the shareable link** (stated plainly): any signed-in user who has a room's URL becomes a member on visit (G2). "Members only" therefore means "people who were given the link" — deliberate for v1, like a Google Doc on link-sharing. Real invitation/approval is future work. What IS hard-gated: rooms never appear in the lobby of a non-member, and without the link (room id) there is no way in — ids are unguessable.

### Should have (in order; cut from the bottom when timebox presses)
- **Import v2 — Google Docs via Composio per-user OAuth**: connect flow with `requiresConnection` handling; pick doc; reuse segmentation pipeline. Paste import remains the fallback.
- **Payments**: Free = 3 imports **per room** (counted server-side on the room record); Pro subscription = unlimited. Rooms themselves are unlimited on Free — so yes, a determined free user can open a fresh room for 3 more imports; accepted ceiling (D-014), the gate exists to demonstrate enforced tiering, not to survive adversaries. Pricing page. (Real checkout blocked until Connect onboarding — acceptable; gate must still enforce.)
- **Wire log**: bottom-left mono event feed (imports, polls, joins, freezes). Cheap, high demo value.
- **Seeded demo room**: reviewer lands on a populated board in 60 seconds.
- **Design pass**: full brief tokens (chrome/artifact split, three-voice type, motion).

### Stretch (only if hours remain)
- AI chat panel grounded in imported doc text (DeepSpace built-in chat + context stuffing).
- Export summary back to a new Google Doc (same Composio connection).
- Card merge (drag-on-drop); poll countdown timers.

### Cut (deliberate, for the writeup)
- Video/audio (LiveKit): metered billing + testing pain; presence carries togetherness. 
- Yjs collaborative text editor: editor UI is a product in itself; card text edits are already collaborative.
- Multiple import sources beyond Google Docs; scheduling/invite emails/recording; mobile layout; AI auto-clustering of the board; room archive/delete; homemade credit ledger (counted free tier instead).

## Gap review (2026-08-30 — holes found before build)

| # | Gap | Resolution |
|---|-----|-----------|
| G1 | No lobby/home screen ever specified | Minimal my-rooms list + create + join-by-link (must-have) |
| G2 | No join/invite flow | Shareable link; signed-in visitor auto-joins as editor; log as decision |
| G3 | Auth mode undecided | Gated (all room access requires sign-in); landing stays public |
| G4 | Import assumed tidy docs | AI segmentation by idea, not headings; mode choice; wire log says `CARD n`, not `SECTION n/m` |
| G5 | OAuth is the riskiest dependency on the critical path | Build paste-text import FIRST; Google Docs layers on the same pipeline |
| G6 | Import failure mid-job unspecified | Keep completed cards; job record carries error; wire log line; retry = new import |
| G7 | Concurrent card edits | Last-write-wins via `put` merge; acceptable, logged |
| G8 | AI endpoints are developer-billed & unmetered by platform | Free-tier import cap doubles as the rate limit; summary capped per room per minute |
| G9 | Poll double-voting | Deterministic vote record id `pollId:userId` |
| G10 | Who is facilitator after creator leaves | Creator stays facilitator (record on room); transfer = cut, logged |
| G11 | Export needs to work even if Docs write scope unavailable | Markdown download is the primary; Docs push is stretch |

## Non-functional

- Desktop-first; legible at half-screen width (demo = two windows side by side).
- WCAG AA contrast per design brief tokens; dark ink on orange buttons everywhere.
- Secrets only in `deepspace secrets`. No identity outside verified JWTs.
- Multi-user behavior verified with a two-user test (freeze enforcement is the one that must have it).
- Timebox: stop at ~8h of build; unfinished edges go in the writeup honestly.
