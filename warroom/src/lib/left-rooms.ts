/**
 * Rooms this SPA session has left (B-015). Leaving revokes your read access,
 * so the server can't push the membership update to YOU — your cached copy
 * of the room record stays pre-leave and the lobby row would linger. Both
 * leave paths record the id here; the lobby filters against it. A full
 * reload needs none of this — server scoping omits the room entirely.
 */
export const leftRooms = new Set<string>()
