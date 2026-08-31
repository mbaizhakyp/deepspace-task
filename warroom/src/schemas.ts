/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Two scopes (D-007): the app scope (`app:<appId>`) holds users + the rooms
 * registry; each board is its own record room (`board:<roomId>`) holding
 * cards/polls/votes/events/settings. The worker's AppRecordRoom serves both,
 * so it receives the union of all schemas; each RecordScope client-side
 * subscribes with the slice it needs.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { roomsSchema } from './schemas/rooms-schema'
import { auditSchema } from './schemas/audit-schema'
import { boardCollectionSchemas } from './schemas/board-schemas'

/** App scope: lobby + auth + admin audit trail. */
export const appSchemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  roomsSchema,
  auditSchema,
]

/** Board scope: one room per board. Users registers presence identity there too. */
export const boardSchemas: CollectionSchema[] = [
  usersSchema,
  ...boardCollectionSchemas,
]

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  roomsSchema,
  auditSchema,
  ...boardCollectionSchemas,
]
