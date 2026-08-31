/**
 * Room lifecycle actions: create, join, freeze.
 *
 * These run RBAC-off (see action-routes.ts trust model), so each one
 * authorizes explicitly against the app-scope room record before writing.
 * All room-registry mutations flow through here — clients cannot update
 * `rooms` at all (schema: member update false).
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { AppActionTools } from '../server/action-routes'

type RoomData = {
  name: string
  memberIds: unknown
  facilitatorId: string
  importCount?: number
}

export function parseMemberIds(raw: unknown): string[] {
  const ids = typeof raw === 'string' ? safeJson(raw) : raw
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

async function getRoom(tools: AppActionTools, roomId: string) {
  const res = await tools.get<RoomData>('rooms', roomId)
  return res.success ? (res.data?.record ?? null) : null
}

async function logEvent(tools: AppActionTools, roomId: string, text: string) {
  await tools.forRoom(`board:${roomId}`).create('events', { at: Date.now(), text })
}

export const createRoom: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const t = tools as AppActionTools
  const name = typeof params.name === 'string' ? params.name.trim().slice(0, 80) : ''
  const userName = typeof params.userName === 'string' ? params.userName.slice(0, 80) : 'facilitator'
  if (!name) return { success: false, error: 'room name required' }

  const created = await t.create('rooms', {
    name,
    memberIds: [userId],
    facilitatorId: userId,
    importCount: 0,
  })
  if (!created.success || !created.data?.recordId) {
    return { success: false, error: created.success ? 'create failed' : created.error }
  }
  const roomId = created.data.recordId

  // The enforcement copy the DO reads on every mutation (worker.ts freezeDenial)
  await t.forRoom(`board:${roomId}`).create(
    'board_settings',
    { facilitatorId: userId, frozenBy: null, frozenByName: null, frozenAt: null },
    'settings',
  )
  await logEvent(t, roomId, `${userName.toUpperCase()} OPENED THE ROOM`)
  return { success: true, data: { roomId } }
}

export const joinRoom: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const t = tools as AppActionTools
  const roomId = typeof params.roomId === 'string' ? params.roomId : ''
  const userName = typeof params.userName === 'string' ? params.userName.slice(0, 80) : 'someone'
  if (!roomId) return { success: false, error: 'roomId required' }

  const room = await getRoom(t, roomId)
  if (!room) return { success: false, error: 'room not found' }

  const members = parseMemberIds(room.data.memberIds)
  if (members.includes(userId)) return { success: true, data: { roomId, already: true } }

  // Join-by-link is open to any signed-in user (REQUIREMENTS G2).
  await t.update('rooms', roomId, { memberIds: [...members, userId] })
  await logEvent(t, roomId, `${userName.toUpperCase()} JOINED`)
  return { success: true, data: { roomId } }
}

export const setFreeze: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const t = tools as AppActionTools
  const roomId = typeof params.roomId === 'string' ? params.roomId : ''
  const frozen = params.frozen === true
  const userName = typeof params.userName === 'string' ? params.userName.slice(0, 80) : 'facilitator'
  if (!roomId) return { success: false, error: 'roomId required' }

  const room = await getRoom(t, roomId)
  if (!room) return { success: false, error: 'room not found' }
  if (room.data.facilitatorId !== userId) {
    return { success: false, error: 'only the facilitator can freeze the board' }
  }

  await t.forRoom(`board:${roomId}`).update('board_settings', 'settings', {
    frozenBy: frozen ? userId : null,
    frozenByName: frozen ? userName : null,
    frozenAt: frozen ? Date.now() : null,
  })
  await logEvent(t, roomId, frozen ? `BOARD FROZEN BY ${userName.toUpperCase()}` : `BOARD UNFROZEN`)
  return { success: true, data: { frozen } }
}
