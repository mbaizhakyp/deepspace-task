# Warroom — DeepSpace build exercise

A persistent collaborative "war room": import a doc, work on it as live cards with your team, decide with polls, control the room with facilitator freeze, leave with an AI summary. **"A war room, not a call. The meeting is the artifact."** Built on the DeepSpace SDK for their hiring exercise (see `task.txt`).

## Key documents (read before working)

- `docs/REQUIREMENTS.md` — what we're building, scope decisions, gap review
- `docs/PLAN.md` — staged implementation plan; tasks map 1:1 to commits
- `docs/BUGLOG.md` — bugs AND decisions log. **Discipline: every bug hit, every non-obvious decision made gets an entry at the moment it happens, not retroactively.**
- `design-brief.md` — visual identity ("newsroom wire terminal"); exact tokens live there
- `.agents/skills/deepspace/SKILL.md` — DeepSpace operating rules (auto-loads)
- `examples/taskspace`, `examples/drawspace` — reference implementations (gitignored; read-only)

## Working agreements

- **Commits are stage markers.** One commit per completed task from `docs/PLAN.md`, message format: `stage N: <what shipped>`. Small fixes between stages: `fix: <what>` with a BUGLOG entry id when applicable.
- **Bug log first, fix second.** When something breaks, add the BUGLOG entry (symptom, hypothesis) before/while fixing; close it with the root cause and fix.
- **Flag to the user** (do not decide silently): anything requiring their login/OAuth in a browser, spending money (deploy quota, paid integrations beyond cents), destructive ops (undeploy, data reset), or scope changes to REQUIREMENTS.md.
- Ponytail is active: minimal diffs, platform primitives over reinvention, one runnable check per non-trivial logic.
- Timebox: 6–8h total. When a task overruns, cut per the priority order in PLAN.md and log the decision.

## DeepSpace conventions that bite (from the skill — verify against docs.deep.space when unsure)

- Records are envelopes: fields under `record.data`; `put(id, patch)` merges server-side.
- Disable write controls until `useMutations().ready`.
- Data/auth hooks only inside the `(app)/` provider boundary; top-level pages are static.
- Keep the scaffold's `users` schema; extend, never rename.
- Secrets only via `deepspace secrets` — never `.dev.vars` edits, env prefixes, commits, or logs.
- Identity only from verified JWT; never in WS URLs or client-controlled headers.
- Server-side RBAC lives in collection schemas; per-room roles resolve from the room's own member records.
- CLI refusals: branch on `code` + exit code, run shipped `action` only; don't pre-probe.
- Check `npx deepspace auth whoami --json` before any id-minting verb (deploy, dev start, test run, push, secrets write).

## Project facts

- App lives in `warroom/` (scaffolded; repo root is the exercise folder).
- Stack: DeepSpace SDK — Vite + React, Hono worker, Tailwind v4, Durable Objects, deploys to `<name>.app.space`.
- Data model: app scope holds the rooms registry + users; each board is its own record room `board:<id>` (cards, polls, votes, members) — mirrors taskspace's team-room pattern.
- Capabilities used: auth, realtime records, RBAC (dynamic freeze), presence, server actions, background import job, AI (segmentation + summary), Composio Google Docs import, payments (free tier gate). Polls ride on realtime records.
