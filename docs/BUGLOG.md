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

## D-007 · Per-board record rooms (`board:<id>`), registry in app scope
When: planning
Decision: each board is its own DO room with its own members/cards/polls; app scope holds only the rooms registry + users.
Why: room-scoped RBAC gives "user A provably cannot read board B" for free; mirrors taskspace's proven team pattern; isolates board data at the DO level.
Beats: all boards in app scope with a BoardId column — one DO hotspot and permission filtering we'd have to hand-write.
