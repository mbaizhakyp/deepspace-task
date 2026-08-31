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
