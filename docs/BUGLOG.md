# Warroom — Bug & Decision Log

Two kinds of entries, one timeline. Newest at the bottom. Every bug gets logged when hit (symptom + hypothesis), closed when fixed (root cause + fix + how verified). Every non-obvious decision gets logged when made (what, why, what it beats). IDs: `B-###` bugs, `D-###` decisions.

Format:

```
## B-001 · <short title> · OPEN|FIXED
When: <stage/task> · Where: <file/command>
Symptom: what we observed (exact error text if short)
Hypothesis → Root cause: what it turned out to be
Fix: what changed · Verified: how we know it's fixed
```

```
## D-001 · <short title>
When: <stage/task>
Decision: what we chose
Why: the constraint or evidence
Beats: the alternative and why it lost
```

---

## B-001 · App registration blocked: quota exceeded · OPEN — NEEDS USER
When: stage 2 · Where: `npx deepspace app init` → `[app_quota_exceeded]`
Symptom: registration refused; existing app `forever-dolly` (app_01M0YF3SGMNED4W2NNVJ49V8P3, active, forever-dolly.app.space) holds the only slot.
Impact: `dev start`, `test run`, `deploy` all blocked until resolved — and (found at stage 10) even `npm run test:unit` is blocked: vitest.config.ts calls `appIdDefine`, which refuses the `__APP_ID__` placeholder in wrangler.toml. Building continues compile-only (tsc + eslint green through stage 10); every runtime check is queued in PLAN under "verify once dev runs".
User decision required (CLI ships no action on purpose): (a) free the slot — `npx deepspace app undeploy app_01M0YF3SGMNED4W2NNVJ49V8P3 --yes` (removes that deployed app!) — or (b) upgrade the plan. I will not undeploy without explicit say-so.

## B-002 · Composio Google Docs tool slugs unverified · OPEN
When: stage 7 · Where: `src/actions/google-docs.ts`
Symptom: none yet — preemptive. `TOOLKIT='googledocs'` and `GET_DOC_TOOL='GOOGLEDOCS_GET_DOCUMENT_BY_ID'` follow Composio's published naming but tool discovery (`composio/list-tools`) is a runtime call blocked by B-001.
Fix path: on first live run, call list-tools filtered to the googledocs toolkit and correct the constants if they differ; also verify the doc-JSON shape against `extractDocText`'s walker.

## B-003 · Every server action 401'd: unawaited getAuthToken · FIXED
When: runtime verification (first live E2E run) · Where: `warroom/src/lib/actions-client.ts`
Symptom: warroom.spec.ts timed out at room creation; lobby never navigated; no room record created.
Hypothesis → Root cause: `getAuthToken()` returns `Promise<string | null>` and was used synchronously, so every action call sent `Authorization: Bearer [object Promise]` → action route refused. TS didn't flag it because a Promise stringifies legally in a template literal.
Fix: `await getAuthToken()` (taskspace's callAction confirmed the pattern). · Verified: warroom.spec.ts passes end-to-end after the fix (see run log).

## B-004 · Freeze was NOT server-enforced: DO cached the wrong room id · FIXED
When: runtime verification · Where: `warroom/worker.ts` AppRecordRoom
Symptom: warroom.spec.ts's enforcement probe — a raw `core.put` pushed through the frozen user's live socket — LANDED (card moved to x=4242 across clients) while the board was frozen. UI looked frozen; server wasn't.
Hypothesis → Root cause: board-ness was sniffed from the DO's FIRST fetch URL (taskspace's pattern). But a new board's first fetch is the create-room action's internal tools call (`…/api/tools/execute`), so `cachedRoomId` became `"execute"` and the interception never armed for that DO instance, forever.
Fix: dropped URL sniffing; the room proves it is a board by its own data — the `board_settings/settings` row exists only in board rooms, and `freezeDenial` already reads it per-mutation. · Verified: the same raw-socket probe is now rejected while frozen and lands after unfreeze (warroom.spec.ts passes; full suite 11/11 + 8 unit).
Note: this is exactly why the spec drives a mutation past the disabled UI — button-disabling would have hidden this bug through every demo.

## B-005 · Room "duplicated itself" after second-account login · FIXED (was never a duplicate)
When: user report, 2026-08-31 · Where: lobby
Symptom (reported): after logging in from a different account, "Q3 Launch Plan" appeared twice in the lobby (user screenshots: gmail account shows two identical MEMBER rows; .job account shows one FACILITATOR row).
Repro attempts that ruled out data duplication: (1) second account joins via link → one row; (2) lobby held open during a live memberIds update → no dup; (3) double-click "Open a room" → one room.
Root cause: **two distinct room records legitimately share the name "Q3 Launch Plan"** — the seeded demo room (facilitator: test account Alice, verified by probing Alice's lobby: exactly one row) and a second room the .job account created itself. The gmail account joined BOTH via links, and the lobby rendered rooms as name + own-role only — zero disambiguation, so two different rooms read as one duplicated one. A UI defect, compounded by the demo room using the most obvious name a real user would also pick.
Fix: lobby rows now carry `<FACILITATOR>'S ROOM · <date opened>` (facilitator name resolved from the app roster's public identity — no schema change), so same-named rooms are tellable apart. · Verified: type-checked + suite green; the two rows will now read "ALICE'S ROOM · AUG 30" vs "YOUR ROOM · AUG 31" style labels.
Defense shipped earlier stays: create double-submit ref guard; audit trail records every create/join.
Related accepted ceiling: join-room read-modify-write race on memberIds can drop one of two same-instant joiners (self-heals on reload).

## B-002 · Composio Google Docs: "THAT DOCUMENT CAME BACK EMPTY" · FIXED
When: stage 7 (flagged pre-runtime) → hit live by user 2026-08-31 · Where: `src/actions/google-docs.ts`
Symptom: Google Doc import failed with "that document came back empty" although the Composio call succeeded (200, no requiresConnection).
Diagnosis path: shipped shape-of-response diagnostics; the user's retry returned `{body:{content:[6]},documentId,title,namedStyles,…}` — a perfectly valid Google Docs resource **at the TOP level of the integration result**. My code read `payload.data` (one level too deep → undefined → empty text). The tool slug (`GOOGLEDOCS_GET_DOCUMENT_BY_ID`) and the text walker were both correct.
Fix: `extractDocText(payload.data ?? payload)` + a unit regression test using the exact reported shape. · Verified: 10/10 unit tests green; user retry on prod is the final confirmation.
Lesson recorded: the shape-reporting error message turned a blind guess into a one-line fix from a single user retry — that's the audit/diagnostics loop working as designed (D-015).

## D-015 · One audit trail, three writers, platform reporter for the client half
When: 2026-08-31 (user request: action + error loggers, admin-reviewable)
Decision: a single admin-read-only `audit` collection in the app scope; written server-side only from two choke points (the action route wraps every action call; runJob wraps every job) — no per-action logging code. Client-side JS errors use the SDK's `installClientErrorReporter` + `registerClientErrorRoute` (land in `deepspace logs` tagged CLIENT) instead of the collection. Minimal internal `/audit` viewer page now; the real admin portal stays future work.
Why: choke points mean nothing can forget to log; admin-only RBAC means the trail is invisible to users; deep string truncation keeps document content out of it.
Beats: per-feature log calls (drift), a custom client reporter (the platform ships one), building the portal now (not asked for).

## B-006 · Decided polls weren't settled: late votes and reopens were server-legal · FIXED
When: 2026-08-31, found by external review (second-model pass over the docs)
Symptom: nothing user-visible — clients disable voting on closed polls, but the server accepted raw votes on decided polls, and `polls: update true` let ANY member flip status back to open (or forge an early close). Results of a "decided" poll were quietly mutable.
Root cause: the votes collection can't see poll status, and status is just a column under a blanket update rule — another time-varying rule RBAC can't express (same class as freeze, D-008).
Fix: two new guards in AppRecordRoom's message boundary next to freezeDenial — `closedPollVoteDenial` (create/revote/delete votes on a decided poll → rejected) and `pollStatusDenial` (open poll: creator or facilitator may close; decided poll: only the facilitator may reopen — decided means decided, even for the creator).
Verified: warroom.spec.ts extended — B fires a raw vote AND a raw reopen at a decided poll through its live socket; both bounce; the facilitator's close of someone else's poll works. 11/11 green. Interesting wrinkle: the first spec run "failed" because B is the poll's creator and the draft rule let creators reopen — the test forced the product decision, then enforced it.

## D-016 · External review triage: what we took, what was already solved
When: 2026-08-31 (user forwarded a second model's review of the repo docs)
Taken (real): B-006 poll lifecycle holes; delete-× shown on cards the server would refuse (now mirrors `delete:'own'`); PLAN checkboxes/stale sketches contradicting shipped code (now a marked historical doc with divergence notes); REQUIREMENTS `?`-bullet rewritten as the decision; shareable-link access model stated honestly; per-room quota loophole documented as accepted (D-014); design-brief deviation notes; SUBMISSION gains hour breakdown + leads with adversarial evidence.
Already solved in shipped code (review read pre-build docs): vote overwrite (userBound + uniqueOn + update:'own' — deterministic ids were never shipped); freeze role-loop atomicity + mid-freeze joiners (D-008 interception has neither problem); hand-rolled import loop (platform JobRoom, D-010); summary rate-limit (server-side summaryAt check).
Declined: making per-account import metering real now (accepted ceiling, D-014); stripping the card-rotation design work (already done and cheap; design polish never displaced a correctness fix).

## B-007 · Presence counted tabs, not people · FIXED
When: user report, 2026-08-31 · Where: Board presence roster
Symptom: 2 users, one opens the room in a second tab → "3 PRESENT" and a duplicate avatar; your own second tab even shows you your own cursor.
Root cause: presence is per-connection (correct at the transport layer); the UI rendered connections as people.
Fix: client-side dedupe — drop peers matching your own userId and keep the first connection per user. Decision folded in: multiple tabs from one account ARE allowed (harmless, and blocking them would fight browser reality); they just count once. · Verified: suite green; manual two-tab check pending user confirmation.

## B-008 · Cards shake for a frame after drag release · FIXED
When: user report, 2026-08-31 · Where: Board drag handling
Symptom: on release, the dragged card twitches for ~a frame before settling.
Root cause: drag streams positions at 120ms intervals; on release the local drag override was removed immediately, so the card rendered the last SYNCED (up to 120ms stale) position until the final write echoed back.
Fix: hold the drop position as a local override for 800ms while the echo lands (`settled` state). · Verified: suite green; visual check pending user confirmation.

## D-017 · Joining a meeting: the link IS the code, and now the UI says so
When: user question ("how to join someone's meeting?"), 2026-08-31
Decision: two additions — an INVITE button in the room header (copies the room link, confirms "LINK COPIED") and a lobby field "Invited? Paste the room link or code" that accepts a full URL or the bare room id. No separate code system.
Why: the join mechanism (shareable link, G2) existed but was invisible — the facilitator had to copy the address bar and know to do it. The room id already is an unguessable code; minting a second one would be reinvention.
Beats: Zoom-style short codes + a code registry (new collection, collision handling, expiry — for zero added security over the id).

## D-018 · Summary keeps its synchronous action; gets honest staged progress
When: user request ("show AI summary thinking process, async like import"), 2026-08-31
Decision: the summary stays one synchronous action call; the panel now shows an elapsed-time staged progress line (READING THE BOARD → WEIGHING THE POLLS → WRITING THE DISPATCH) — indeterminate but honest, no fake percentages. The import keeps its REAL progress (it's a durable job creating N cards).
Why: the summary is a single ~5–15s AI call — there is no intermediate state to report; converting it to a JobRoom job buys real progress only if summaries ever become multi-step (upgrade path noted in code).
Beats: fake percentage bars (dishonest) and a job conversion now (cost without new information).

## D-020 · Google Docs picker, discovery-first (B-002 confirmed by user)
When: 2026-08-31 (user confirmed the B-002 fix live, then asked for a picker)
Decision: the Google Doc tab now leads with "BROWSE YOUR GOOGLE DOCS" — a picker listing the caller's recent docs (`GOOGLEDOCS_SEARCH_DOCUMENTS` on their own connection), click-to-import; the paste-a-link field stays as fallback. Tool slugs were NOT guessed this time: `list-gdocs { discover: true }` calls `composio/list-tools` and returns the toolkit's real catalog — the search slug + arg names were verified against production before the picker went live. The listing parser walks for {id,title} pairs at any nesting (the B-002 lesson, generalized) with a unit test.
Why: paste-a-URL made users do the app's job (open Drive, hunt, copy, return); discovery mode turns future slug/shape surprises into a one-call diagnosis.
Beats: guessing the search slug (B-002 déjà vu) and replacing the paste fallback (covers docs the listing misses).
Found in discovery, noted for later: `GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT` could replace the JSON body walker; not switched — the current fetch path is live-verified.

## D-001 · No video/audio calls
When: planning
Decision: presence (avatars + live cursors) carries the "we're together" feeling; no LiveKit.
Why: metered billing, miserable to test, steals the demo; the collaboration story doesn't depend on it.
Beats: LiveKit video/audio — worst return-on-hours on the table; noted in writeup as the deliberate scope cut.

## D-002 · One import source, added second
When: planning
Decision: Google Docs is the only OAuth source; paste-text import ships FIRST as the working fallback.
Why: OAuth is the riskiest external dependency on the critical path (G5); paste de-risks the demo completely.
Beats: multi-source import (each source multiplies testing) and OAuth-first (single point of demo failure).

## D-003 · Freeze = member-role flip via server action
When: planning
Decision: freeze flips every non-facilitator member record to Role `frozen` (PrevRole stored); unfreeze restores. Enforcement is the schema RBAC itself.
Why: roles are data the DO already enforces server-side; freezing becomes ~15 lines of privileged loop, and role changes propagate to clients over the same sync channel as the data they protect.
Beats: (a) client-side hiding — a security hole, rubric explicitly checks gating; (b) custom DO message interception — more code, more surface, taskspace-style override not needed.

## D-004 · AI segments by idea, not by headings
When: planning (user challenge: "the document might be unorganized")
Decision: import segmentation is an AI call; headings are a hint, never a requirement. Import mode choice: "everything as cards" vs "key points only". Wire log counts CARDs, not SECTION n/m.
Why: messy docs (notes, transcripts, walls of text) are the common case; heading-split yields 1 giant or 30 junk cards.
Beats: heading-based splitting (free but fragile); source-panel select-to-extract (better but ~half a day — named as next step in writeup).

## D-005 · Counted free tier, not a credit ledger
When: planning
Decision: Free = 3 imports (ImportCount on room/user, checked server-side); Pro = unlimited via requireSubscription().
Why: rubric penalizes reimplementing platform primitives; a homemade credit-balance system is reinvented billing.
Beats: user-visible "credits" balance — same UX value, 10× the code and edge cases.

## D-006 · Frozen means frozen (votes too)
When: requirements
Decision: frozen members cannot vote; voting requires editor role.
Why: one rule is explainable and provable in the live session; per-collection freeze exceptions invite matrix bugs.
Beats: "frozen can still vote" — plausible product choice, but doubles the permission states to test in the timebox.

## D-008 · Freeze enforcement = webSocketMessage interception in AppRecordRoom (supersedes D-003's mechanism)
When: stage 1 (SDK research)
Decision: freeze is enforced by overriding `webSocketMessage` in our `AppRecordRoom`: when the board's settings record says frozen and the sender is not the facilitator, `core.put`/`core.delete` messages are answered with `core.error` and dropped. D-003's role-flip is dead.
Why: `RecordRoom` (deepspace 0.28.2) exposes no `authorizeWrite` hook (JobRoom has one; RecordRoom doesn't — verified in `dist/worker.d.ts`), and per-room role rows may be cached in the connection attachment at connect time, so a role flip might not bite until reconnect. Message interception is deterministic and evaluated per mutation. Taskspace ships the same pattern (USER_LIST interception), so it's SDK-sanctioned.
Beats: role flip (uncertain propagation), client-only disable (rubric fail).

## D-009 · Board access gated at the WS route from the app-scope room record
When: stage 1 (SDK research)
Decision: `/ws/:roomId` for `board:*` rooms gets a membership check in the worker (mirroring the scaffold's own `resolveDocsYjsRole` pattern): load the room record from app scope, 403 unless caller is in `MemberIds`. Lobby read isolation via `read: 'collaborator'` + `collaboratorsField: 'MemberIds'` on the rooms collection.
Why: by default ANY authenticated user may connect to any record room — per-board rooms are not access-isolated unless the worker gates them. The scaffold demonstrates exactly this pattern for Yjs docs.
Beats: 'team' permission + members collection per room — more moving parts, and it still wouldn't stop the initial connection.

## D-010 · Import uses the platform JobRoom, not a hand-rolled jobs collection
When: stage 1 (SDK research)
Decision: import runs as an `AppJobRoom` job (`enqueueJob` from the action, `ctx.progress()` streaming, `useJobs('board:<id>')` client-side). PLAN Task 6's `jobs` collection is dropped.
Why: the scaffold ships a durable job runner with real-time progress over WS — exactly the rubric's "platform primitives instead of reimplementing".
Beats: progress-record polling (reinvention, worse UX).

## D-011 · Composio confirmed for Google Docs (native google/* can't do it)
When: stage 1 (docs research)
Decision: Docs import goes through `composio/*` per-user OAuth as planned; the native `google/*` integration stays unused for now.
Why: `/guides/google-oauth.md` lists only Gmail/Calendar/Drive-list/Contacts endpoints — no Docs content fetch/export.
Beats: nothing — it's the only road; recorded so we don't relitigate it mid-build.

## D-012 · No `members` collection in board rooms
When: stage 1 (SDK research)
Decision: membership's source of truth is `MemberIds` (json) on the app-scope room record; the board room's auto-registered users table is the display roster.
Why: one source of truth for both the WS gate (D-009) and the lobby query; a separate members collection would be a second copy to keep in sync.
Beats: per-room members records (drift risk, more schema).

## D-013 · Build order swap: summary/payments before Google Docs OAuth
When: stage 6 (user away, B-001 open)
Decision: stages run 6 → 8 → 9 → 7. Google Docs via Composio moves last.
Why: Composio's toolkit/tool slugs are discovered by runtime API calls (needs app registration, blocked by B-001) and testing needs the user's Google consent in a browser; summary/export and payment declarations are pure code I can compile-verify now.
Beats: writing speculative Composio code against guessed slugs — guessed integration code is how agents ship broken OAuth.

## D-014 · Import quota is per-room and enforced in the job handler
When: stage 6
Decision: any member's client may enqueue an import over WS; the HANDLER re-derives identity from job.enqueuedBy (server-stamped), checks membership + the 3-free-imports quota against the app-scope room record, and only then acts. payload.roomId is untrusted until that check.
Why: client-side enqueue is the platform's native path (useJobs); gating at enqueue would need a custom action AND still leave the WS path open. One choke point at execution covers every path.
Beats: a start-import server action (second path to secure, worse progress UX).

## D-007 · Per-board record rooms (`board:<id>`), registry in app scope
When: planning
Decision: each board is its own DO room with its own members/cards/polls; app scope holds only the rooms registry + users.
Why: room-scoped RBAC gives "user A provably cannot read board B" for free; mirrors taskspace's proven team pattern; isolates board data at the DO level.
Beats: all boards in app scope with a BoardId column — one DO hotspot and permission filtering we'd have to hand-write.
