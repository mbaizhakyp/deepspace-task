import type { CollectionSchema } from 'deepspace/schema'

/**
 * Audit trail — every server action call and every server-side error, written
 * by the worker (never by clients). Read path is admin-only: this is the data
 * source for the future admin portal. Client-side JS errors go through the
 * platform's client-error reporter into `deepspace logs` instead.
 */
export const auditSchema: CollectionSchema = {
  name: 'audit',
  columns: [
    { name: 'at', storage: 'number', interpretation: 'plain', required: true },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: ['action', 'job', 'error'] }, required: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain' },
    { name: 'userName', storage: 'text', interpretation: 'plain' },
    { name: 'roomId', storage: 'text', interpretation: 'plain' },
    { name: 'ok', storage: 'number', interpretation: 'plain' },
    { name: 'detail', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
