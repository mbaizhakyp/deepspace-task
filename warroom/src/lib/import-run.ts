/**
 * Multi-doc import runs (B-018): one import of N docs = N jobs, FIFO. A run
 * is every import-text job newer than the stale marker (the newest job that
 * existed BEFORE the run started). Pure so the aggregation is testable
 * without OAuth or a job room.
 */

export type RunJob = {
  id: string
  type: string
  status: string
  progress?: number
  progressMessage?: string
  result?: unknown
}

/** Jobs belonging to the current run, newest-first (platform order). */
export function collectRun<T extends RunJob>(jobs: T[], staleJobId: string | null): T[] {
  const out: T[] = []
  for (const j of jobs) {
    if (j.type !== 'import-text') continue
    if (j.id === staleJobId) break
    out.push(j)
  }
  return out
}

/** Chronological per-doc card counts — "5 + 3 + 4 = 12" is built from this. */
export function createdParts(runJobs: RunJob[]): number[] {
  return [...runJobs].reverse().map((j) => (j.result as { created?: number } | undefined)?.created ?? 0)
}
