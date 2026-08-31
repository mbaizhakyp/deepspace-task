import type { CollectionSchema } from 'deepspace/schema'

/**
 * App-scope rooms registry. One record per war room.
 *
 * membership source of truth: `memberIds` (D-012). The WS gate in
 * realtime-routes.ts reads it before letting anyone into `board:<id>` rooms,
 * and `read: 'collaborator'` scopes the lobby list to rooms you belong to.
 *
 * All mutations go through server actions (create-room / join-room /
 * import) — `update: false` for members means no client can add themselves
 * to memberIds or reset importCount.
 */
export const roomsSchema: CollectionSchema = {
  name: 'rooms',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'memberIds', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'facilitatorId', storage: 'text', interpretation: 'plain', immutable: true },
    { name: 'importCount', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'summary', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'summaryAt', storage: 'number', interpretation: 'plain' },
  ],
  collaboratorsField: 'memberIds',
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: 'collaborator', create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
