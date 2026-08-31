# Warroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution — timeboxed solo build; subagent-per-task overhead not justified). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed collaborative war-room app (rooms → live cards → polls → freeze → AI import/summary) on DeepSpace within the 6–8h exercise timebox.

**Architecture:** Standard DeepSpace scaffold (Vite+React client, Hono worker, Durable Object record rooms). App scope holds the rooms registry; each board is its own record room `board:<id>` with per-room member roles (taskspace's team pattern). Privileged flows (join, freeze, import, summary) are server actions; import runs as a job that streams progress through a synced record.

**Tech Stack:** DeepSpace SDK (records, presence, RBAC, server actions, AI + Composio integrations, payments), Tailwind v4, Playwright (scaffold test rig).

**Spec:** `docs/REQUIREMENTS.md` (this plan argues from it). Design: `design-brief.md`.

## STATUS (2026-08-30, night — SHIPPED)

**Live at https://warroomhq.app.space.** All stages complete and verified:
8 unit + 11 Playwright tests green (incl. the two-user server-enforced-freeze
spec), scripted prod E2E (sign-in → room → real AI import, 9 cards → poll →
summary) with screenshots in docs/screenshots/. Writeup: docs/SUBMISSION.md.

Open items (need the user): live-verify Google Docs OAuth (B-002, one consent
click); optional Stripe Connect onboarding for real checkout; submit in the
portal.

## Global Constraints

- Timebox ~8h build; when a task overruns, cut per REQUIREMENTS priority and log in BUGLOG.
- One commit per task: `stage N: <what shipped>`.
- Records are envelopes (`record.data`); writes disabled until `useMutations().ready`; hooks only inside `(app)/`.
- Freeze/permissions must be server-enforced — client-side hiding alone is a fail.
- Secrets via `deepspace secrets` only. AI/integration endpoints developer-billed → free-tier caps are the rate limit.
- Design tokens from `design-brief.md`: ground `#101210`, panel `#191C19`, line `#2A2E2A`, cream `#F4F1E8`, ink `#1A1A16`, green `#4ADE80`, orange `#E8641B`; Instrument Serif / Inter / IBM Plex Mono (mono = 11px, tracking .08em, uppercase). Dark ink on orange buttons.

---

### Task 0: Docs + repo hygiene ✅ (this commit)

**Files:** Create `CLAUDE.md`, `docs/REQUIREMENTS.md`, `docs/PLAN.md`, `docs/BUGLOG.md`, `.gitignore` (examples/, scratchpad, node_modules, .env*, test artifacts).

- [x] Write the four documents
- [ ] `git add` + commit `stage 0: project docs, requirements, plan, bug log`

### Task 1: Preflight + scaffold

**Files:** Create `warroom/` (scaffold output). Inspect: `warroom/worker.ts`, `warroom/src/schemas.ts`, `warroom/src/pages/`, catalogs.

**Interfaces produced:** running scaffold app on a dev port; catalog facts recorded in BUGLOG (composio endpoints for Google Docs; anthropic endpoint name; payments availability).

- [ ] `npx deepspace auth whoami --json` — if signed out: **STOP, flag to user** (browser OAuth is theirs to do)
- [ ] `npm create deepspace@latest warroom` (registration mints on first dev start — verify account first)
- [ ] `npx deepspace add --list` and `integrations info composio/execute-tool`, `integrations info anthropic/chat-completion` — record exact endpoint shapes in BUGLOG
- [ ] `cd warroom && npx deepspace dev start` — confirm scaffold boots; note the port
- [ ] Read scaffolded `worker.ts` + `src/schemas.ts`; diff mental model against taskspace; adjust plan if the scaffold's shape differs (log any surprise)
- [ ] Commit `stage 1: deepspace scaffold boots`

### Task 2: Schemas + worker wiring (the data contract)

**Files:** Create `warroom/src/schemas/rooms.ts`, `boards.ts` (cards/polls/votes/members/settings); modify `warroom/src/schemas.ts`, `warroom/worker.ts`.

**Interfaces produced (later tasks rely on these names):**
- App scope collections: `rooms` (Name, CreatedBy, CreatedAt, FrozenBy nullable, ImportCount number)
- Board scope (`board:<roomId>`) collections: `cards` (Title, Body, X, Y, Origin, CreatedBy, CreatedAt), `polls` (Question, Options json, Status open|closed, CreatedBy, ClosedAt), `votes` (PollId, OptionIndex, VoterName), `members` (UserId, Role facilitator|editor|frozen, PrevRole, Name), `jobs` (Kind, Status running|done|error, Done number, Total number, Note)
- Permission matrix per collection:
  - `cards`: facilitator full; editor read/create/update/delete `true`; frozen read-only
  - `polls`: facilitator full; editor read/create; update only facilitator+creator-close (server action closes); frozen read
  - `votes`: editor read/create/update; frozen read (freeze means freeze — REQUIREMENTS)
  - `members`: read all roles; writes only via server action (no client role escalation)
  - `jobs`: read all roles; writes server-action only
- Worker: `AppRecordRoom extends RecordRoom` fed all schemas; `PresenceRoom` wired; roomId pattern `board:<id>`.

- [ ] Write schema files (copy taskspace's `CollectionSchema` shape; roles named `facilitator/editor/frozen` mapped onto the SDK's role slots — verify against permissions docs first: fetch `docs.deep.space/concepts/permissions.md`)
- [ ] Wire into `worker.ts`
- [ ] Check: `npx deepspace test run` (scaffold suite still green) + boot dev, confirm no schema errors in logs
- [ ] Commit `stage 2: data model + RBAC matrix`

### Task 3: Rooms + board + presence (first demoable core)

**Files:** Create `warroom/src/pages/(app)/index.tsx` (lobby), `(app)/room/[id].tsx` (board), `src/components/Board.tsx`, `Card.tsx`, `Cursors.tsx`; `src/actions/join-room.ts`.

**Interfaces produced:** `useRoomData(roomId)` hook wrapping `useQuery`/`useMutations` for board collections; join-room server action (creates member record with Role editor, facilitator for creator).

- [ ] Lobby: my rooms (query `rooms` where member), create room (creates room record + own member record via server action), join by URL
- [ ] Board: render cards from query; add card; drag = `put(id, {X,Y})`; edit title/body inline; delete own
- [ ] Presence: scaffold presence room → avatar stack, `n PRESENT`, live cursors (throttle ~60ms)
- [ ] **Two-window check (manual):** card added/moved in window A appears live in window B; cursors visible
- [ ] Commit `stage 3: rooms, live board, presence`

### Task 4: Polls

**Files:** Create `warroom/src/components/PollCard.tsx`, `src/actions/close-poll.ts`; modify `Board.tsx`.

- [ ] Create-poll UI (question + 2–4 options) → poll record
- [ ] Vote: `create('votes', {...}, `${pollId}:${userId}`)` — deterministic id makes revote an overwrite. **One runnable check:** vote twice as same user, assert one vote record
- [ ] Live bars (percentage of votes per option), counts, `n VOTED` mono line
- [ ] Close (creator/facilitator via server action → Status closed, ClosedAt); closed render state per design (winner orange, loser gray)
- [ ] Two-window check: vote in A, bar moves in B
- [ ] Commit `stage 4: live polls with one-vote-per-user`

### Task 5: Facilitator freeze (the permission showpiece)

**Files:** Create `warroom/src/actions/set-freeze.ts`; modify `Board.tsx`, `Card.tsx`, room header.

**Sketch (server action, runs with privileged tools; verify caller is facilitator FIRST):**
```ts
// set-freeze { roomId, frozen: boolean }
const room = tools.forRoom(`board:${roomId}`)
const me = await room.query('members', { where: { UserId: userId } })
if (me.data?.records?.[0]?.data?.Role !== 'facilitator') return { error: 'not_facilitator' }
const all = await room.query('members', {})
for (const m of all.data.records) {
  if (m.data.Role === 'facilitator') continue
  await room.update('members', m.id, frozen
    ? { PrevRole: m.data.Role, Role: 'frozen' }
    : { Role: m.data.PrevRole ?? 'editor', PrevRole: null })
}
await tools.update('rooms', roomId, { FrozenBy: frozen ? userId : null })
```

- [ ] Implement action + FREEZE/UNFREEZE header toggle (facilitator only)
- [ ] Frozen UI: board dim, orange viewport border, `BOARD FROZEN BY <NAME>` banner, write controls disabled, drag attempt shake
- [ ] **Enforcement check (the one that matters):** while frozen, fire a card mutation from window B (or direct API call) → server refuses. Playwright two-user spec if the scaffold's multi-user fixture makes it cheap; manual + logged evidence otherwise
- [ ] Commit `stage 5: server-enforced facilitator freeze`

### Task 6: Import v1 — paste text, AI segmentation, background job

**Files:** Create `warroom/src/actions/import-text.ts`, `src/components/ImportPanel.tsx`; modify `Board.tsx`.

**Flow:** action creates `jobs` record (running, Total unknown→n) → calls `anthropic/chat-completion` via `tools.integration` asking for JSON `[{title, body}]` (mode: "all cards" | "key points"; segment by idea, headings are hints) → creates cards one by one, bumping `jobs.Done` after each → Status done. Client renders progress panel + cards appear live. On error: Status error + Note, completed cards kept (G6). Bump `rooms.ImportCount`.

- [ ] Implement action (background-job pattern from `/guides/background-jobs.md` — fetch it first; if the doc's job primitive fits better than a hand-rolled loop, use it and log the decision)
- [ ] Import panel UI (paste box, mode radio, mid-import progress per design)
- [ ] **Check:** paste a heading-less wall of text → several sensibly-titled cards; wire log line
- [ ] Two-window check: importer in A, cards materialize in B
- [ ] Commit `stage 6: AI paste import as live background job`

### Task 7: Import v2 — Google Docs via Composio (per-user OAuth)

**Files:** Create `warroom/src/actions/google-docs.ts` (list/fetch), modify `ImportPanel.tsx` (connect state, doc picker).

- [ ] `composio/list-toolkits` → confirm Google Docs toolkit + tool slugs (recorded in Task 1); `initiate-connection` → consent URL button; `get-connection` polling; `execute-tool` fetch doc text → feed into Task 6 pipeline
- [ ] Handle `requiresConnection` signal gracefully (show connect button, retry after)
- [ ] **User attention:** needs a real Google account consent in the browser — flag when ready to test
- [ ] Commit `stage 7: google docs import via composio oauth`
- **Cut line:** if Composio/toolkit blocks >45min, ship paste-only, log, move on.

### Task 8: AI summary + export

**Files:** Create `warroom/src/actions/summarize.ts`, `src/components/SummaryPanel.tsx`.

- [ ] Action: read cards + closed polls → `anthropic/chat-completion` → `{decisions:[{time,title,detail}]}` → store on room record (cache 1/min — G8)
- [ ] Dispatch panel per design; export = Markdown file download
- [ ] Commit `stage 8: summary dispatch + markdown export`

### Task 9: Payments gate

**Files:** Create/modify `warroom/src/subscriptions.ts`, pricing page, gate in `import-text.ts`.

- [ ] Declare Free/Pro per `/guides/payments.md`; gate: `ImportCount >= 3 && !pro` → refuse with `upgrade_required`; client shows pricing
- [ ] Check: 4th import as free user refused server-side
- [ ] Commit `stage 9: free tier gate + pro subscription`
- Note for writeup: real checkout needs dashboard Connect onboarding; gate enforced regardless.

### Task 10: Design pass + seed + landing

- [ ] Apply brief tokens/type/motion across screens; wire log component; public landing page
- [ ] Seed demo room (script or first-login bootstrap action)
- [ ] Commit `stage 10: design pass + demo seed`

### Task 11: Verify, deploy, writeup

- [ ] `npx deepspace test run all`; fix or log failures honestly
- [ ] `/security-review` skill over the diff (secrets, identity, permission holes)
- [ ] `npx deepspace deploy` → live URL; `deepspace logs --follow` while exercising the core path on prod; two-window check on prod
- [ ] Draft `docs/SUBMISSION.md`: what built, capabilities used, main tradeoff, what the agent did, what the human verified, next steps
- [ ] Commit `stage 11: deployed + submission writeup`

## Self-review notes

- Spec coverage: G1–G11 all land in tasks (G1/G2→3, G4/G5/G6/G8→6, G9→4, G10→REQUIREMENTS cut, G11→8, G3→scaffold auth config in 1/3, G7→3).
- Known unknowns deferred to Task 1 on purpose (scaffold file shapes, exact role-slot names, composio tool slugs, background-job primitive) — each has a "fetch the doc first" step rather than an invented API.
- AI chat panel + Docs export-back are stretch; absent from tasks by design — they enter only if Task 11 starts early.
