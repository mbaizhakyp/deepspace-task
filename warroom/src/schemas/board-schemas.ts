import type { CollectionSchema } from 'deepspace/schema'

/**
 * Board-room collections — live in each `board:<roomId>` record room.
 *
 * Access to the room itself is gated at the WS route (D-009): only users in
 * the app-scope room record's memberIds can connect at all, so in-room
 * permissions can be simple. Freeze (D-008) is enforced in AppRecordRoom's
 * webSocketMessage override, not here — RBAC has no time-varying lever.
 */

/** One record (id 'settings') per board. Written only by server actions. */
export const boardSettingsSchema: CollectionSchema = {
  name: 'board_settings',
  columns: [
    { name: 'facilitatorId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'frozenBy', storage: 'text', interpretation: 'plain' },
    { name: 'frozenByName', storage: 'text', interpretation: 'plain' },
    { name: 'frozenAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const cardsSchema: CollectionSchema = {
  name: 'cards',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'body', storage: 'text', interpretation: 'plain' },
    { name: 'x', storage: 'number', interpretation: 'plain', required: true },
    { name: 'y', storage: 'number', interpretation: 'plain', required: true },
    { name: 'origin', storage: 'text', interpretation: { kind: 'select', options: ['added', 'imported'] } },
    { name: 'authorName', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    // update: true — any member may move/edit any card (triage together is the product)
    member: { read: true, create: true, update: true, delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const pollsSchema: CollectionSchema = {
  name: 'polls',
  columns: [
    { name: 'question', storage: 'text', interpretation: 'plain', required: true },
    { name: 'options', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['open', 'closed'] } },
    { name: 'x', storage: 'number', interpretation: 'plain' },
    { name: 'y', storage: 'number', interpretation: 'plain' },
    { name: 'authorName', storage: 'text', interpretation: 'plain' },
    { name: 'closedAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    // members may open polls and move them; closing stamps closedAt via the
    // same update (creator or facilitator — checked in UI; a member forging a
    // close only ends a vote early, it cannot forge results)
    member: { read: true, create: true, update: true, delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const votesSchema: CollectionSchema = {
  name: 'votes',
  columns: [
    { name: 'pollId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'voterId', storage: 'text', interpretation: 'plain', userBound: true, required: true },
    { name: 'optionIndex', storage: 'number', interpretation: 'plain', required: true },
    { name: 'voterName', storage: 'text', interpretation: 'plain' },
  ],
  // one vote per user per poll, enforced by the database
  uniqueOn: ['pollId', 'voterId'],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    // revote = update own vote; nobody can touch someone else's
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

/** Wire log — the meeting writing its own record. Append-only. */
export const eventsSchema: CollectionSchema = {
  name: 'events',
  columns: [
    { name: 'at', storage: 'number', interpretation: 'plain', required: true },
    { name: 'text', storage: 'text', interpretation: 'plain', required: true },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

export const boardCollectionSchemas: CollectionSchema[] = [
  boardSettingsSchema,
  cardsSchema,
  pollsSchema,
  votesSchema,
  eventsSchema,
]
