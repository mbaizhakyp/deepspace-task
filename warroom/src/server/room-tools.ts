/**
 * Privileged record-room tools for worker-side code that isn't a server
 * action (the job handler). Same trust model as action-routes.ts: RBAC is
 * OFF on this path — callers must authorize against room membership
 * themselves before writing.
 */

import { apiWorkerFetch } from 'deepspace/worker'
import type { Env } from '../../worker'

type ToolResult<T> = { success: boolean; error?: string; data?: T }

export function roomTools(env: Env, roomId: string, asUserId: string) {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(roomId))

  async function exec<T>(tool: string, params: Record<string, unknown>): Promise<ToolResult<T>> {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': asUserId,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({ tool, params }),
      }),
    )
    return (await res.json()) as ToolResult<T>
  }

  return {
    create: (collection: string, data: Record<string, unknown>, recordId?: string) =>
      exec<{ recordId: string }>('records.create', { collection, data, recordId }),
    update: (collection: string, recordId: string, data: Record<string, unknown>) =>
      exec('records.update', { collection, recordId, data }),
    get: <T extends Record<string, unknown>>(collection: string, recordId: string) =>
      exec<{ record: { recordId: string; data: T } }>('records.get', { collection, recordId }),
    query: <T extends Record<string, unknown>>(collection: string, options?: Record<string, unknown>) =>
      exec<{ records: Array<{ recordId: string; data: T }> }>('records.query', {
        collection,
        ...(options ?? {}),
      }),
  }
}

/** Developer-billed integration call (the app owner pays — imports and summaries). */
export async function ownerIntegration<T>(
  env: Env,
  endpoint: string,
  data: unknown,
): Promise<{ success: boolean; error?: string; message?: string; data?: T }> {
  const res = await apiWorkerFetch(env, `/api/integrations/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.APP_OWNER_JWT}`,
    },
    body: JSON.stringify(data ?? {}),
  })
  return (await res.json()) as { success: boolean; error?: string; message?: string; data?: T }
}
