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

## D-021 · Landing hook: hand-built miniature Room, not generated imagery
When: post-submission polish (user asked about Higgsfield for the landing)
Decision: elevate the landing with the brief's missing "live-looking product shot of the Room" (design-brief §6.6) — a CSS miniature board that assembles itself (staggered card-drop, live poll fillbars, breathing presence, cycling wire log) built from the app's own animation utilities. Declined AI-generated (Higgsfield) hero imagery.
Why: the identity is typographic restraint; the strongest hook for a tool is the tool. Zero new dependencies/assets — every animation class already existed for the real board.
Beats: a generated cinematic hero — the one element that would make a distinctive page read generic, plus an asset pipeline outside my hands (needs the user's Higgsfield account).

## D-022 · Board camera: local pan/zoom, world coords in records
When: post-submission polish (friend feedback: "zoom out and drag it to one side, like infinite canvas")
Decision: the board gets a per-user camera — drag empty ground to pan, wheel pans, ctrl/pinch zooms at the pointer, mono HUD (−/%/+/RESET) bottom-right. View is LOCAL state; records keep world coordinates, so two people can frame the board differently while dragging the same cards. Presence cursors now sync in world coords (glued to cards under any camera). World grew to 2400×1400; pan clamps so ≥160px of the table stays on-screen (can't get lost). Math lives in pure `src/lib/camera.ts` with unit tests (zoom-at-pointer invariant, clamp bounds).
Why: fixed viewport meant a busy import could push cards out of reach; camera transform (one wrapper div) is the platform-primitive answer.
Beats: truly infinite canvas (unbounded coords complicate clamping, import placement, and "where is everyone" for zero demo value) and synced viewports (fighting over one camera).

## B-009 · Pan drag runs a native text selection across cards · FIXED
When: D-022 verification (prod screenshot showed card meta text highlighted after a pan)
Symptom: dragging the board ground to pan left orange selection highlights on card text the pointer crossed.
Root cause: pointer-event panning doesn't suppress the browser's native drag-to-select.
Fix: `select-none` on the board field. · Verified: re-ran the prod pan script; screenshot clean.

## D-023 · Import journey: checkpoint stepper + camera centers on landed cards
When: post-submission polish (user: checkmarks per step, journey line, board centers on pulled cards)
Decision: the import panel shows a vertical journey — PULLING THE DOC FROM GOOGLE (gdoc only) → READING & SEGMENTING → MAKING CARDS (bar + CARD n/m) → LANDED ON THE BOARD — markers ticking green with a wire line that fills as each step completes. Every checkpoint binds to a REAL signal (action in flight, job status, the 0.15 progress boundary between the job's READING phase and per-card ticks, terminal status); nothing is timed or guessed (D-018 honesty rule). On the observed running→succeeded transition, everyone's camera glides (700ms) to fit the imported cards — skipped for anyone mid-drag/pan, never on room entry with an old finished import. fitView is pure camera math with unit tests.
Why: the stages already existed in the job's progress stream; the UI just surfaces them. Centering closes the loop the camera opened: cards can land outside your frame.
Beats: a "connecting" checklist step (OAuth is a once-ever exceptional branch, stays as the consent prompt) and fake timed steps.

## B-010 · Playwright suite blocked by vite-checker overlay on an eslint WARNING · FIXED
When: D-023 verification · Where: dev server, `vite-plugin-checker-error-overlay`
Symptom: 3 specs failed with "overlay intercepts pointer events"; ESLint reported 0 errors, 1 warning (an unused eslint-disable directive in Board.tsx).
Root cause: the checker overlay covers the app for warnings too, eating every click in headless runs.
Fix: removed the unused directive (the deps lint didn't actually fire on `importJob?.status`). · Verified: lint clean, 11 Playwright green.

## B-011 · Second import stacked its cards on top of the first batch · FIXED
When: user feedback round 2 · Where: `src/jobs.ts` importText
Symptom: every import placed its grid at the same fixed origin (60,80), so batch 2 landed exactly on batch 1.
Root cause: placement never looked at what was already on the board.
Fix: the job queries existing cards and starts its grid below their max y; it also returns this batch's bbox in the job result so clients center the camera on the NEW cards only. · Verified on prod: two live imports → rows at y=80 and y=340, zero overlap (docs/screenshots/ux-reset-fits-all.png).

## D-024 · Canvas goes unlimited; RESET becomes fit-all (reverses part of D-022)
When: user feedback round 2 (asked twice: "make the canvas unlimited")
Decision: no world bounds — coordinates are unbounded, pan is unclamped, zoom floor drops to 20%, the dot grid paints on the viewport (shifted/scaled with the camera, subdividing so dots never crowd below 12px). RESET now glide-fits every card and poll into the window instead of jumping to origin — the "way home" that made bounds unnecessary. New cards/polls spawn at the viewer's current view center.
Why: D-022 chose bounds to prevent getting lost; the user's own pairing (unlimited + fit-all reset) solves that better.
Beats: keeping the 2400×1400 table (artificial walls users hit while spreading out).

## D-025 · Toolbar differentiation: line glyphs + group separators, not color or emoji
When: user feedback round 2 ("buttons not differentiated visually — brainstorm")
Decision: each toolbar button gets a 14px mono-weight line glyph (person+ invite, snowflake freeze, tray-arrow import, chart-bars poll, square+ card) and hairline separators split room controls | board actions | the one orange Summarize ask. Close/delete affordances grew: bordered CLOSE ✕ on panels, bordered DELETE/CLOSE chips on polls, larger card ×.
Why: recognizability without breaking the wire voice — the brief bans emoji in chrome and allows one orange ask, so glyphs + grouping were the levers left.
Beats: per-button accent colors (rainbow chrome violates the palette) and icon-only buttons (labels carry the wire identity).

## D-026 · Facilitator can delete any poll; server narrows via DO guard
When: user feedback round 2 ("add poll deletion button" — it existed, creator-only and easy to miss)
Decision: polls schema widens member delete to `true`; a new pollDeleteDenial guard in worker.ts rejects deletes from anyone but the creator or facilitator (RBAC can't express "facilitator"). UI shows the delete chip to creator and facilitator.
Verified: spec asserts the facilitator deleting a member's poll syncs to both windows; the deny path mirrors the already-adversarially-tested pollStatusDenial pattern (a 3rd non-creator account would be needed to raw-test it — noted, not faked).

## B-012 · Import journey flashed all-green when starting a second import · FIXED
When: user feedback round 3 · Where: `src/components/ImportPanel.tsx`
Symptom: on a repeat import the stepper opened with every checkpoint green for a few seconds, then reset and ran properly.
Root cause: the panel rendered the newest `import-text` job — which, until the fresh job's record arrives, is the PREVIOUS succeeded one.
Fix: starting an import marks the prior job id stale; the stepper only reads a job newer than that. · Verified: prod repeat import opens on step 1.

## D-027 · Day edition: a second theme, not a generic dark/light switch
When: user feedback round 3 ("dark/light mode icon would be nice")
Decision: a "day edition" theme — chrome flips to newsprint (#e7e3d8 ground, ink text, forest green for live signals since phosphor fails on light), artifacts (paper, ink, the one orange) are IDENTICAL in both editions. Toggled from the nav (sun/moon glyph, DAY/NIGHT), persisted in localStorage, applied pre-paint in index.html to avoid a flash. Deviates from the brief's "dark, always" — user override, and the newsroom day-desk/night-desk framing keeps it in identity.
Beats: a stock light theme (would relight the paper cards and break the chrome-vs-artifact tension).

## D-028 · Lobby: front-page masthead + one-intent-at-a-time forms
When: user feedback round 3
Decision: the lobby reads like a newspaper front page (double-rule masthead, serif "The Warroom", mono edition line with the date and free-tier terms, dotgrid ground). Create/join collapsed behind two buttons — NEW ROOM / JOIN BY LINK — the field appears only after picking an intent (user's suggestion, agreed: less clutter, and the empty state stops looking like a form dump).
Beats: decorative backgrounds (gradients/illustrations are banned by the brief; the masthead IS the theme).

## D-029 · In-room exits: ← LOBBY always, LEAVE for members, DELETE ROOM for facilitator
When: user feedback round 3 ("no intuitive back/leave or delete room buttons")
Decision: back link in the room header; a two-step armed (D-019, no popups) LEAVE (members — new leave-room server action that strips the caller from memberIds; the facilitator is refused and told to delete instead) or DELETE ROOM (facilitator — existing action, now reachable without returning to the lobby).
Beats: a hamburger/overflow menu (hides the two actions people actually asked for).

## D-030 · Imported cards on manila; summary exports = .md + print/PDF; summary progress goes checkpoint-style
When: user feedback round 3
Decisions: (a) imported cards render on manila stock (new --color-manila token) vs house paper for added cards — the origin label alone wasn't scannable at board distance. (b) Summary export adds PRINT / PDF via a print stylesheet that makes the dispatch sheet the printed page — a real PDF path with zero dependencies; declined a PDF library (weight for no gain). (c) The summary's progress adopts the import journey's checkpoint visuals while keeping its honest elapsed-time semantics (D-018 — the code and log still say the stages are timed, not observed).

## D-031 · docs/DECISIONS.md — curated decision record, committed (not gitignored)
When: user feedback round 3 ("make a document for these decisions; decide whether git should ignore it")
Decision: a showcase-ready decision record distilled from this log (architecture, security, integrations, UX, process), committed to the repo — the exercise scores how decisions were made, so the record is part of the deliverable, not a private note. BUGLOG.md stays the chronological source of truth; DECISIONS.md points into it.

## B-013 · Owner's lobby listed every room in the app · FIXED
When: user feedback round 4 ("I shouldn't see rooms I didn't create or join") — resolves the earlier "all rooms visible" mystery
Symptom: one account saw rooms it never created or joined.
Root cause: `rooms` read is `'collaborator'`-scoped for members, but the app OWNER holds the admin role, and admin read is `true` — the platform is behaving correctly; the lobby just showed everything admin could read.
Fix: the lobby filters client-side to rooms where you're facilitator or member (admin oversight belongs to /audit, not the lobby). Server-side scoping for non-admins unchanged. · Verified: owner-visible room list now matches membership.

## D-032 · Camera home button: RESET → FIT ALL with a frame glyph
When: user feedback round 4 ("Reset sounds like it deletes everything")
Decision: renamed to FIT ALL with a frame-corners icon and a "bring every card and poll into view" tooltip. Naming-is-UX: a camera action must not sound like a data action.

## D-033 · Board export: Markdown transcript from the HUD
When: user feedback round 4 ("the board itself should be exportable")
Decision: EXPORT .MD in the camera HUD downloads the whole table — every card (title, body, origin, author) and every poll with live tallies and status. Beats a PNG snapshot (needs a rendering dependency, loses the text; the product's thesis is that the artifact is the CONTENT).

## D-034 · Nav: bigger, and absent inside a room
When: user feedback round 4
Decision: nav grows to h-16 with the serif wordmark at display size; inside /room/* it doesn't render at all — the board is the screen (the brief's rule), and the room header's ← LOBBY is the way out. Day theme got a contrast pass in the same round (ground dropped two stops below paper, hairlines and chrome text deepened) after "light theme is mostly white" feedback.

## D-035 · Payments complete: Stripe Connect onboarded, checkout verified live
When: user completed Connect onboarding at /earnings (their Stripe identity — flagged as user-only work)
Verified: redeploy shows "Synced 1 plan to Stripe" with no owner_connect_not_ready warning; a prod probe as a test account clicked Go Pro and landed on checkout.stripe.com (session created, purchase deliberately NOT completed — no card entered). The free-tier gate (3 imports/room, forged-enqueue-proof) was already adversarially verified; entitlement lifts it via isProEntitled at job execution.
SUBMISSION.md's known-limitation line removed — the limitation no longer exists.

## B-014 · "Go Pro" dimmed for the first beat of every pricing visit · FIXED
When: user feedback round 5 · Where: pricing.tsx
Symptom: the button rendered at 50% opacity for a moment on page load.
Root cause: `disabled={sub.isLoading}` tied the button's look to the subscription state fetch — a loading concern leaking into a stable control.
Fix: the button stays visually steady; only an actual click sets a local busy state ("Opening checkout…"). · Verified on prod.

## D-036 · Google Docs browsing is the headline import path; multi-select; link collapsed
When: user feedback round 5
Decisions: (a) the import panel opens on the GOOGLE DOCS tab — browsing your own docs is the demo-grade path, paste is the fallback. (b) Doc rows are now checkboxes: select any number, and the one "Import to the board" button imports them — sequentially on purpose, each doc = one import = one quota unit = one job (the journey notes "N DOCS QUEUED"); combining docs into one mega-import would have made 25 docs cost one quota unit. (c) The paste-a-link field collapses behind "+ PASTE A LINK INSTEAD".
Beats: import-on-row-click (took the primary button out of the loop — the user's observation) and parallel enqueues (racing writes for no UX gain).

## D-037 · Board export button is a download glyph
When: user feedback round 5. The HUD's EXPORT .MD text became the tray-download icon (same glyph as IMPORT's, inverted meaning read from context) with tooltip + aria-label.

## D-038 · Yearly billing exposed: MONTHLY/YEARLY toggle on the Pro card
When: user feedback round 5 ("no way to choose annual plan")
Decision: subscriptions.ts already declared yearlyCents (both Stripe Prices existed since Connect sync) — the page just never offered the choice. A MONTHLY/YEARLY toggle switches the displayed price ($9/mo ↔ $90/yr, "two months free") and passes { interval } to subscribe(). Verified on prod: yearly checkout reaches checkout.stripe.com showing $90.00/year.

## D-039 · Room codes: WR-XXXXXX join codes alongside links
When: user feedback round 6 ("codes instead of links — more professional")
Decision: every room gets a 6-char code (unambiguous alphabet, no I/L/O/0/1 — codes get read aloud) shown as a click-to-copy WR- chip in the room header. The lobby join field takes a code, a link, or a bare id (`parseJoinInput`, unit-tested; an explicit WR- prefix never falls back to the id path). Resolution happens server-side in join-room — the registry isn't readable by non-members, so the RBAC-off action scans for the code and joins in one call. Rooms created before codes get one lazily on the next join. Links still work — codes are additive.
Beats: replacing links (a URL you can paste into chat is the lowest-friction invite; professional ≠ fewer options).

## D-040 · Join button lights orange when the input parses; lobby LEAVE; members vs online
When: user feedback round 6
Decisions: (a) JOIN turns solid orange the moment the field holds a valid code/link — the "you may go" affordance. (b) Member rows in the lobby get the two-step LEAVE (same arm pattern); this is also the remedy for "I can still see Harsh's room": opening a room link JOINS you (the invite model working as designed), so the .job account became a member by visiting once — now it can leave from either the lobby or the room. (c) The room header shows both facts: "N ONLINE · M MEMBERS" — presence and membership are different numbers and both matter.

## B-015 · After leaving a room, its lobby row lingered for the leaver · FIXED
When: D-039/D-040 verification (focused two-user prod test — the row survived 6s with the room still alive)
Root cause: leaving revokes YOUR read access to the room record, so the server cannot push the membership update to you — your client keeps rendering its last-readable copy, and no state change ever evicts it. Scoped-subscription staleness, invisible to happy-path tests because a reload fixes it.
Fix: both leave paths record the id in a session-local set the lobby filters against (plus a render tick — a module Set doesn't re-render React). A full reload needs none of this; server scoping omits the room. · Verified: row gone immediately post-leave, room still alive.

## B-016 · Reopening the import panel greeted a NEW import with the old "LANDED · N CARDS" · FIXED
When: user report, round 7 · Where: ImportPanel.tsx
Symptom: opening IMPORT after a past import showed the previous run's landed line under the fresh form.
Root cause: two leaks of finished-job state into the form view — a residual success line rendered whenever the newest job was succeeded, and a job that finished before the panel opened was never marked stale (B-012 only staled jobs at submission time).
Fix: the residual line is gone (a finished import reports once, in the journey; the board's wire log carries history), and any terminal job observed while the form is showing is marked stale on sight. · Verified on prod: panel-scoped check shows 0 "LANDED" in the panel after close→reopen; the wire log's IMPORT LANDED event (intended history) remains.

## D-041 · "20 credits" for the QA account → raised server-side import allowance
When: user request, round 7 ("give mbaizhakyp.job@gmail.com 20 credits, I'm testing from that account")
Decision: the platform has no grantable credits mechanism (CLI has no credits verb; UserCredits is platform-managed), and the app's only scarcity is the per-room import quota — so "20 credits" became: allowlisted tester emails get a 20-imports-per-room allowance in the shared quota gate (checkQuotaAndEnqueue), checked server-side by looking up the caller's users record — a client cannot claim tester status. Everyone else keeps 3 free / Pro unlimited.
Beats: gifting Pro (hides the paywall behavior the tester is meant to see) and a stored credits ledger (schema + two counters for one QA account).
Note: unverifiable by me — test accounts aren't allowlisted and prod won't get fake allowlist entries; the user confirms from the .job account.

## D-042 · Round-8 UX: merged invite, batch paper stocks, themed dispatch with history
When: user feedback round 8
Decisions:
- INVITE and the code chip merged into one fixed-width COPY INVITE (btn-solid) that copies link + "or enter code WR-XXXXXX" in one clipboard write; fixed width kills the label-swap reflow the user saw (the nav grew vertically when LINK COPIED wrapped).
- Each import batch lands on its own paper stock: the job stamps `tint` (importCount % 4) on every card; four muted warm tints. Verified on prod: two imports → two visibly distinct card groups.
- Import journey stages with no measurable signal (pulling, segmenting — the long one) show an indeterminate sweep bar + a real elapsed clock (WORKING · 00:07). Real motion and real time, never a fake percentage (D-018 held).
- The dispatch panel is theme chrome now (bg-card/foreground — the user's ask); print still forces the paper palette so a PDF is always a light dispatch. Controls moved to the TOP (download without scrolling): HISTORY toggle, a solid download icon opening a format menu (.MD / PDF-print), CLOSE.
- Summary history: every dispatch is kept in a new server-written `summaries` board collection (member read-only); the panel lists them and any past dispatch can be viewed and exported.

## D-043 · Button contrast hierarchy: solid, orange, wire
When: user feedback round 8 ("relevant journey buttons should be filled with a contrasting color — you decide")
Decision: three tiers. (1) ORANGE stays reserved for each screen's one true ask (Summarize, Import to the board, Open a room, armed JOIN, Go Pro). (2) A new `.btn-solid` (foreground-on-background — auto-contrasts in both themes) fills secondary journey actions: COPY INVITE, BROWSE YOUR GOOGLE DOCS, IMPORT ANOTHER, the whole camera HUD (also enlarged), the dispatch download icon. (3) Wire-bordered stays for chrome/utilities (toolbar, CLOSE, HISTORY).
Beats: filling everything (kills hierarchy) and more orange (violates the one-ask rule).
