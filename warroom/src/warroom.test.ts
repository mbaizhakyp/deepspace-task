/**
 * Unit checks for the parsing seams — the places where AI output or stored
 * JSON crosses into our logic. These run with no dev server (B-001-proof).
 */

import { describe, expect, it } from 'vitest'
import { extractJsonArray } from './jobs'
import { parseSummary } from './actions/summarize'
import { parseMemberIds } from './actions/rooms'

describe('extractJsonArray (AI card segmentation output)', () => {
  it('parses a clean array', () => {
    expect(extractJsonArray('[{"title":"A","body":"b"}]')).toEqual([{ title: 'A', body: 'b' }])
  })
  it('strips code fences and surrounding prose', () => {
    expect(extractJsonArray('```json\n[{"title":"A","body":"b"}]\n```')).toHaveLength(1)
    expect(extractJsonArray('Here you go: [{"title":"A","body":"b"}] hope that helps')).toHaveLength(1)
  })
  it('returns [] on garbage instead of throwing', () => {
    expect(extractJsonArray('no json here')).toEqual([])
    expect(extractJsonArray('[{broken')).toEqual([])
    expect(extractJsonArray('{"an":"object"}')).toEqual([])
  })
})

describe('parseSummary (AI dispatch output)', () => {
  it('parses a valid dispatch', () => {
    const s = parseSummary('{"headline":"h","decisions":[{"title":"t","detail":"d"}]}')
    expect(s?.headline).toBe('h')
    expect(s?.decisions).toHaveLength(1)
  })
  it('survives fences and drops malformed decisions', () => {
    const s = parseSummary('```json\n{"headline":"h","decisions":[{"title":"t","detail":"d"},{"bad":1}]}\n```')
    expect(s?.decisions).toHaveLength(1)
  })
  it('rejects wrong shapes', () => {
    expect(parseSummary('[]')).toBeNull()
    expect(parseSummary('{"headline":1,"decisions":[]}')).toBeNull()
    expect(parseSummary('plain text')).toBeNull()
  })
})

describe('extractDocText (Google Docs resource, real shape from B-002)', () => {
  it('extracts text when the doc resource is the payload itself (no .data nesting)', async () => {
    const { extractDocText } = await import('./actions/google-docs')
    const doc = {
      title: 'Q3 Plan',
      documentId: 'abc',
      display_url: 'https://…',
      body: {
        content: [
          { sectionBreak: {} },
          { paragraph: { elements: [{ textRun: { content: 'Hello ' } }, { textRun: { content: 'world.\n' } }] } },
        ],
      },
    }
    expect(extractDocText(doc)).toContain('Hello world.')
    expect(extractDocText(doc)).toContain('Q3 Plan')
  })
  it('returns empty for undefined', async () => {
    const { extractDocText } = await import('./actions/google-docs')
    expect(extractDocText(undefined)).toBe('')
  })
})

describe('extractDocList (picker: doc listings in unknown nesting)', () => {
  it('finds id+title pairs wherever they sit, dedupes, tolerates junk', async () => {
    const { extractDocList } = await import('./actions/google-docs')
    const payload = {
      response_data: {
        documents: [
          { documentId: 'a', title: 'Plan', modifiedTime: '2026-08-30T00:00:00Z' },
          { id: 'b', name: 'Notes' },
          { documentId: 'a', title: 'Plan (dup)' },
          { noise: true },
        ],
      },
    }
    const docs = extractDocList(payload)
    expect(docs.map((d) => d.id)).toEqual(['a', 'b'])
    expect(docs[0].title).toBe('Plan')
  })
  it('returns [] for garbage', async () => {
    const { extractDocList } = await import('./actions/google-docs')
    expect(extractDocList(undefined)).toEqual([])
    expect(extractDocList('nope')).toEqual([])
  })
})

describe('board camera (pan/zoom math, D-022)', () => {
  it('zoomView keeps the world point under the pointer fixed', async () => {
    const { zoomView, toWorld } = await import('./lib/camera')
    const v = { x: -120, y: 40, scale: 1 }
    const before = toWorld(v, 500, 300)
    const after = toWorld(zoomView(v, 500, 300, 0.5), 500, 300)
    expect(after.wx).toBeCloseTo(before.wx)
    expect(after.wy).toBeCloseTo(before.wy)
  })
  it('zoomView clamps scale to its bounds', async () => {
    const { zoomView, MIN_SCALE, MAX_SCALE } = await import('./lib/camera')
    expect(zoomView({ x: 0, y: 0, scale: 1 }, 0, 0, 0.01).scale).toBe(MIN_SCALE)
    expect(zoomView({ x: 0, y: 0, scale: 1 }, 0, 0, 100).scale).toBe(MAX_SCALE)
  })
  it('fitView centers a card cluster and never zooms past 1:1', async () => {
    const { fitView } = await import('./lib/camera')
    // small cluster: fits at scale 1, centered
    const v = fitView(100, 100, 500, 300, 1200, 800)
    expect(v.scale).toBe(1)
    expect(v.x + 300 * v.scale).toBeCloseTo(600) // cluster center x → viewport center
    expect(v.y + 200 * v.scale).toBeCloseTo(400)
    // huge cluster: scales down to fit, respecting MIN_SCALE
    const { MIN_SCALE } = await import('./lib/camera')
    const wide = fitView(0, 0, 10000, 400, 1200, 800)
    expect(wide.scale).toBeGreaterThanOrEqual(MIN_SCALE)
    expect(wide.scale).toBeLessThan(1)
  })
  it('gridSpacing subdivides so dots never crowd below 12px', async () => {
    const { gridSpacing } = await import('./lib/camera')
    expect(gridSpacing(1)).toBe(24)
    expect(gridSpacing(0.2)).toBeGreaterThanOrEqual(12) // 4.8 → doubled up to 19.2
    expect(gridSpacing(0.2)).toBeCloseTo(19.2)
  })
})

describe('parseJoinInput (lobby join field: url, id, or short code)', () => {
  it('extracts the id from a full room URL', async () => {
    const { parseJoinInput } = await import('./lib/join-code')
    expect(parseJoinInput('https://warroomhq.app.space/room/abc123XYZ_-')).toEqual({ roomId: 'abc123XYZ_-' })
  })
  it('recognizes 6-char codes, with or without the WR- prefix, any case', async () => {
    const { parseJoinInput } = await import('./lib/join-code')
    expect(parseJoinInput('WR-K7M2QX')).toEqual({ code: 'K7M2QX' })
    expect(parseJoinInput('k7m2qx')).toEqual({ code: 'K7M2QX' })
  })
  it('treats long tokens as record ids and rejects junk', async () => {
    const { parseJoinInput } = await import('./lib/join-code')
    expect(parseJoinInput('rec_0123456789abcdef')).toEqual({ roomId: 'rec_0123456789abcdef' })
    expect(parseJoinInput('WR-K7M2Q1')).toBeNull() // 1 not in the alphabet, too short for an id
    expect(parseJoinInput('  ')).toBeNull()
  })
})

describe('multi-doc import run aggregation (B-018)', () => {
  const J = (id: string, status: string, created?: number) => ({
    id,
    type: 'import-text',
    status,
    result: created === undefined ? undefined : { created },
  })
  it('sums the whole run — not just the last doc — and stops at the stale marker', async () => {
    const { collectRun, createdParts } = await import('./lib/import-run')
    // newest-first, as the platform hands them: doc3 (4 cards) enqueued last;
    // "old" finished before this run and is the stale marker
    const jobs = [J('doc3', 'succeeded', 4), J('doc2', 'succeeded', 3), J('doc1', 'succeeded', 5), J('old', 'succeeded', 9)]
    const run = collectRun(jobs, 'old')
    expect(run.map((j) => j.id)).toEqual(['doc3', 'doc2', 'doc1'])
    const parts = createdParts(run)
    expect(parts).toEqual([5, 3, 4]) // chronological — the "5 + 3 + 4" display
    expect(parts.reduce((n, c) => n + c, 0)).toBe(12) // the total, not 4
  })
  it('null stale marker takes every run job; other job types are ignored', async () => {
    const { collectRun } = await import('./lib/import-run')
    const jobs = [J('a', 'running'), { id: 'x', type: 'other-job', status: 'succeeded' }, J('b', 'queued')]
    expect(collectRun(jobs, null).map((j) => j.id)).toEqual(['a', 'b'])
  })
})

describe('parseMemberIds (stored membership json)', () => {
  it('accepts arrays and JSON strings', () => {
    expect(parseMemberIds(['a', 'b'])).toEqual(['a', 'b'])
    expect(parseMemberIds('["a","b"]')).toEqual(['a', 'b'])
  })
  it('filters non-strings and survives garbage', () => {
    expect(parseMemberIds(['a', 1, null])).toEqual(['a'])
    expect(parseMemberIds('{bad json')).toEqual([])
    expect(parseMemberIds(undefined)).toEqual([])
  })
})
