import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createRoom, deleteRoom, joinRoom, leaveRoom, setFreeze } from './rooms'
import { summarize } from './summarize'
import { startImport } from './imports'
import { importGoogleDoc, listGoogleDocs } from './google-docs'

export const actions: Record<string, ActionHandler<Env>> = {
  'create-room': createRoom,
  'join-room': joinRoom,
  'leave-room': leaveRoom,
  'set-freeze': setFreeze,
  'delete-room': deleteRoom,
  summarize,
  'start-import': startImport,
  'import-gdoc': importGoogleDoc,
  'list-gdocs': listGoogleDocs,
}
