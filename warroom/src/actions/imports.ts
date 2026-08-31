/**
 * start-import — the paid path into the import pipeline.
 *
 * Free rooms get FREE_IMPORT_LIMIT imports; past that, this action checks
 * the caller's subscription (their own bearer token — user-billed trust
 * model) and enqueues with a `verified:` enqueuedBy marker the job handler
 * honors. Clients CANNOT set enqueuedBy over WS (the room stamps it), so
 * the marker can only originate here.
 */

import { apiWorkerFetch, enqueueJob } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { AppActionTools } from '../server/action-routes'
import { FREE_IMPORT_LIMIT } from '../jobs'
import { parseMemberIds } from './rooms'

type RoomData = { memberIds: unknown; facilitatorId: string; importCount?: number }

export const startImport: ActionHandler<Env> = async ({ userId, params, tools, env, callerJwt }) => {
  const t = tools as AppActionTools
  const roomId = typeof params.roomId === 'string' ? params.roomId : ''
  const text = typeof params.text === 'string' ? params.text : ''
  const mode = params.mode === 'key-points' ? 'key-points' : 'cards'
  const userName = typeof params.userName === 'string' ? params.userName.slice(0, 80) : ''
  if (!roomId || !text.trim()) return { success: false, error: 'roomId and text required' }

  return checkQuotaAndEnqueue(t, env, callerJwt, { userId, roomId, text, mode, userName })
}

/**
 * Shared gate for every import source (paste, Google Doc): membership,
 * free quota, Pro entitlement, then a `verified:` enqueue.
 */
export async function checkQuotaAndEnqueue(
  t: AppActionTools,
  env: Env,
  callerJwt: string,
  args: { userId: string; roomId: string; text: string; mode: 'cards' | 'key-points'; userName: string },
): Promise<{ success: true; data: { jobId: string } } | { success: false; error: string }> {
  const { userId, roomId, text, mode, userName } = args
  const roomRes = await t.get<RoomData>('rooms', roomId)
  const room = roomRes.success ? roomRes.data?.record?.data : undefined
  if (!room) return { success: false, error: 'room not found' }
  const isMember = room.facilitatorId === userId || parseMemberIds(room.memberIds).includes(userId)
  if (!isMember) return { success: false, error: 'not a member of this room' }

  if ((room.importCount ?? 0) >= FREE_IMPORT_LIMIT) {
    const entitled = await isProEntitled(env, callerJwt)
    if (!entitled) {
      return { success: false, error: 'upgrade_required' }
    }
  }

  const jobId = await enqueueJob(
    env.JOB_ROOMS,
    `board:${roomId}`,
    'import-text',
    { roomId, text, mode, userName },
    { maxAttempts: 1, enqueuedBy: `verified:${userId}` },
  )
  return { success: true, data: { jobId } }
}

/** Ask the platform for the caller's own subscription; entitled = active/trialing pro. */
async function isProEntitled(env: Env, callerJwt: string): Promise<boolean> {
  try {
    const res = await apiWorkerFetch(env, '/api/subscriptions/me', {
      headers: { Authorization: `Bearer ${callerJwt}` },
    })
    if (!res.ok) return false
    const sub = (await res.json()) as { tier?: string; status?: string }
    return sub.tier === 'pro' && (sub.status === 'active' || sub.status === 'trialing')
  } catch {
    return false
  }
}
