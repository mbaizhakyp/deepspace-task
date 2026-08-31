import { getAuthToken } from 'deepspace'

/** Call a server action with the signed-in user's bearer token. */
export async function callAction<T = Record<string, unknown>>(
  name: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; data?: T }> {
  const token = getAuthToken()
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) return { success: false, error: `action ${name} failed (${res.status})` }
  return (await res.json()) as { success: boolean; error?: string; data?: T }
}
