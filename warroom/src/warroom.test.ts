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
