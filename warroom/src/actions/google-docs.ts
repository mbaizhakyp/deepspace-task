/**
 * Google Docs import via Composio per-user OAuth.
 *
 * The user pastes a Google Doc URL; we fetch its content AS THEM (composio
 * is user-billed, so the platform keys the OAuth connection to the caller's
 * JWT) and feed the text into the same import pipeline as paste.
 *
 * The requiresConnection dance: composio answers a success-shaped
 * `requiresConnection` signal when the user hasn't connected the toolkit.
 * We surface `{ needsConnection, redirectUrl }` and the client opens the
 * hosted consent page, then retries.
 *
 * RUNTIME-VERIFY (B-002 candidate): the toolkit + tool slugs below follow
 * Composio's published naming but are unverified until we can run — check
 * with composio/list-tools on first live test and fix here if they differ.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { AppActionTools } from '../server/action-routes'
import { checkQuotaAndEnqueue } from './imports'

const TOOLKIT = 'googledocs'
// Both slugs verified against prod via list-gdocs { discover: true } (D-020).
// ponytail: GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT exists and would replace the
// JSON body walker — switch if the walker ever misses content; the current
// path is live-verified (B-002), so it stays.
const GET_DOC_TOOL = 'GOOGLEDOCS_GET_DOCUMENT_BY_ID'
const SEARCH_DOCS_TOOL = 'GOOGLEDOCS_SEARCH_DOCUMENTS' // args: query, max_results, order_by, …

type ComposioEnvelope = {
  requiresConnection?: boolean
  redirectUrl?: string
  authUrl?: string
  data?: unknown
  successful?: boolean
  error?: string | null
}

export const importGoogleDoc: ActionHandler<Env> = async ({ userId, params, tools, env, callerJwt }) => {
  const t = tools as AppActionTools
  const roomId = typeof params.roomId === 'string' ? params.roomId : ''
  const url = typeof params.url === 'string' ? params.url : ''
  const mode = params.mode === 'key-points' ? 'key-points' : 'cards'
  const userName = typeof params.userName === 'string' ? params.userName.slice(0, 80) : ''

  // picker sends a bare docId; the paste fallback sends a url
  const docId =
    typeof params.docId === 'string' && params.docId ? params.docId : extractDocId(url)
  if (!roomId || !docId) {
    return { success: false, error: 'paste a Google Docs link (docs.google.com/document/d/…)' }
  }

  const res = await t.integration<ComposioEnvelope>('composio/execute-tool', {
    slug: GET_DOC_TOOL,
    arguments: { id: docId },
  })
  if (!res.success) return { success: false, error: res.error ?? 'google docs fetch failed' }

  const payload = (res.data ?? {}) as ComposioEnvelope
  const consentUrl = payload.redirectUrl ?? payload.authUrl
  if (payload.requiresConnection) {
    // Not an error: the user simply hasn't connected Google Docs yet.
    // If the platform didn't inline a consent URL, mint one.
    if (consentUrl) return { success: true, data: { needsConnection: true, redirectUrl: consentUrl } }
    const init = await t.integration<ComposioEnvelope>('composio/initiate-connection', {
      toolkit: TOOLKIT,
    })
    const initUrl = ((init.data ?? {}) as ComposioEnvelope).redirectUrl
    if (init.success && initUrl) {
      return { success: true, data: { needsConnection: true, redirectUrl: initUrl } }
    }
    return { success: false, error: 'could not start the Google connection' }
  }

  // B-002: the platform hands back the document resource at the TOP level of
  // the integration result (body/title/documentId...), not nested under .data
  const text = extractDocText(payload.data ?? payload)
  if (!text.trim()) {
    // B-002 diagnostics: return the envelope's SHAPE (keys only, no content)
    // so the audit trail captures what Composio actually sent back and the
    // extractor / tool slug can be corrected from data instead of guesses.
    return { success: false, error: `that document came back empty (shape: ${shapeOf(payload)})` }
  }

  return checkQuotaAndEnqueue(t, env, callerJwt, { userId, roomId, text, mode, userName })
}

/** Key structure of a response, two levels deep, values elided. */
export function shapeOf(v: unknown, depth = 0): string {
  if (!v || typeof v !== 'object') return typeof v
  if (Array.isArray(v)) return `[${v.length}]`
  const keys = Object.keys(v).slice(0, 12)
  if (depth >= 2) return `{${keys.join(',')}}`
  return `{${keys.map((k) => `${k}:${shapeOf((v as Record<string, unknown>)[k], depth + 1)}`).join(',')}}`
}

/**
 * list-gdocs — the doc picker's data. Lists the calling user's recent Google
 * Docs (optionally filtered by a search query) via their own connection.
 * `{ discover: true }` instead returns the toolkit's tool catalog — the
 * self-diagnosing mode that lets slugs be verified against prod without
 * guessing (the B-002 lesson).
 */
export const listGoogleDocs: ActionHandler<Env> = async ({ params, tools }) => {
  const t = tools as AppActionTools

  if (params.discover === true) {
    const res = await t.integration<unknown>('composio/list-tools', {
      toolkit: TOOLKIT,
      limit: 50,
    })
    if (!res.success) return { success: false, error: res.error ?? 'discovery failed' }
    return { success: true, data: { shape: shapeOf(res.data), catalog: summarizeCatalog(res.data) } }
  }

  const query = typeof params.query === 'string' ? params.query.slice(0, 100) : ''
  const res = await t.integration<ComposioEnvelope>('composio/execute-tool', {
    slug: SEARCH_DOCS_TOOL,
    arguments: { max_results: 25, ...(query ? { query } : {}) },
  })
  if (!res.success) return { success: false, error: res.error ?? 'doc list failed' }

  const payload = (res.data ?? {}) as ComposioEnvelope
  const consentUrl = payload.redirectUrl ?? payload.authUrl
  if (payload.requiresConnection) {
    if (consentUrl) return { success: true, data: { needsConnection: true, redirectUrl: consentUrl } }
    const init = await t.integration<ComposioEnvelope>('composio/initiate-connection', { toolkit: TOOLKIT })
    const initUrl = ((init.data ?? {}) as ComposioEnvelope).redirectUrl
    if (init.success && initUrl) {
      return { success: true, data: { needsConnection: true, redirectUrl: initUrl } }
    }
    return { success: false, error: 'could not start the Google connection' }
  }

  const docs = extractDocList(payload)
  if (docs.length === 0) {
    return { success: false, error: `no documents found (shape: ${shapeOf(payload)})` }
  }
  return { success: true, data: { docs } }
}

export type GDocListing = { id: string; title: string; modified?: string }

/**
 * Pull {id, title} pairs out of whatever list shape comes back — B-002 taught
 * us not to bet on one nesting, so this walks for objects that look like doc
 * records wherever they sit.
 */
export function extractDocList(payload: unknown): GDocListing[] {
  const out: GDocListing[] = []
  const seen = new Set<string>()
  walkForDocs(payload, out, seen, 0)
  return out.slice(0, 25)
}

function walkForDocs(v: unknown, out: GDocListing[], seen: Set<string>, depth: number) {
  if (!v || typeof v !== 'object' || depth > 5) return
  if (Array.isArray(v)) {
    for (const item of v) walkForDocs(item, out, seen, depth + 1)
    return
  }
  const o = v as Record<string, unknown>
  const id =
    (typeof o.documentId === 'string' && o.documentId) ||
    (typeof o.id === 'string' && o.id) ||
    null
  const title =
    (typeof o.title === 'string' && o.title) ||
    (typeof o.name === 'string' && o.name) ||
    null
  if (id && title) {
    if (!seen.has(id)) {
      seen.add(id)
      const modified = typeof o.modifiedTime === 'string' ? o.modifiedTime : undefined
      out.push({ id, title, modified })
    }
    return
  }
  for (const val of Object.values(o)) walkForDocs(val, out, seen, depth + 1)
}

function summarizeCatalog(data: unknown): Array<{ slug?: string; args?: string[] }> {
  const items: Array<{ slug?: string; args?: string[] }> = []
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 4 || items.length > 60) return
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1))
    const o = v as Record<string, unknown>
    if (typeof o.slug === 'string') {
      const props =
        (o.inputParameters as Record<string, unknown> | undefined)?.properties ??
        (o.input_parameters as Record<string, unknown> | undefined)?.properties
      items.push({ slug: o.slug, args: props ? Object.keys(props).slice(0, 10) : undefined })
      return
    }
    Object.values(o).forEach((x) => walk(x, depth + 1))
  }
  walk(data, 0)
  return items
}

export function extractDocId(url: string): string | null {
  const m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}

/**
 * Pull plain text out of a Google Docs API document resource: walk
 * body.content → paragraph.elements → textRun.content. Falls back to
 * harvesting every string field if the shape surprises us — the AI
 * segmenter downstream tolerates mess.
 */
export function extractDocText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  const d = doc as Record<string, unknown>
  const root = (d.response_data ?? d.document ?? d) as Record<string, unknown>
  const body = root.body as Record<string, unknown> | undefined
  const content = body?.content
  if (Array.isArray(content)) {
    const out: string[] = []
    walk(content, out)
    const text = out.join('')
    if (text.trim()) {
      const title = typeof root.title === 'string' ? `${root.title}\n\n` : ''
      return title + text
    }
  }
  return harvestStrings(root).join('\n')
}

function walk(nodes: unknown[], out: string[]) {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const n = node as Record<string, unknown>
    const para = n.paragraph as Record<string, unknown> | undefined
    const elements = para?.elements
    if (Array.isArray(elements)) {
      for (const el of elements) {
        const run = (el as Record<string, unknown>)?.textRun as Record<string, unknown> | undefined
        if (typeof run?.content === 'string') out.push(run.content)
      }
    }
    const table = n.table as Record<string, unknown> | undefined
    const rows = table?.tableRows
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const cells = (row as Record<string, unknown>)?.tableCells
        if (Array.isArray(cells)) {
          for (const cell of cells) {
            const cc = (cell as Record<string, unknown>)?.content
            if (Array.isArray(cc)) walk(cc, out)
          }
        }
      }
    }
  }
}

function harvestStrings(o: unknown, depth = 0, acc: string[] = []): string[] {
  if (depth > 6 || acc.length > 2000) return acc
  if (typeof o === 'string') {
    if (o.length > 2) acc.push(o)
  } else if (Array.isArray(o)) {
    for (const v of o) harvestStrings(v, depth + 1, acc)
  } else if (o && typeof o === 'object') {
    for (const v of Object.values(o)) harvestStrings(v, depth + 1, acc)
  }
  return acc
}
