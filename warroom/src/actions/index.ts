import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createRoom, joinRoom, setFreeze } from './rooms'
import { summarize } from './summarize'
import { startImport } from './imports'

export const actions: Record<string, ActionHandler<Env>> = {
  'create-room': createRoom,
  'join-room': joinRoom,
  'set-freeze': setFreeze,
  summarize,
  'start-import': startImport,
}
