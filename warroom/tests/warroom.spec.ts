/**
 * Warroom two-user spec — the core path: create → join → live sync → poll →
 * freeze. The freeze assertions are the important ones: the frozen user's
 * client pushes a REAL mutation through its live socket (dev test hook) and
 * the server must reject it — button-disabling alone would fail this spec.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}.`,
)

test('war room: live sync, one-vote polls, server-enforced freeze', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b] = await users(2)

  // the walkthrough welcome modal (D-046) would cover the lobby for a fresh
  // profile — mark it done before any page loads
  await a.page.addInitScript(() => localStorage.setItem('warroom-tour2', 'done'))
  await b.page.addInitScript(() => localStorage.setItem('warroom-tour2', 'done'))

  // ── A creates a room ────────────────────────────────────────────────
  await a.page.goto('/rooms')
  await a.page.getByRole('button', { name: 'NEW ROOM' }).click()
  await a.page.getByPlaceholder(/Name a room/).fill('Freeze Proof')
  await a.page.getByRole('button', { name: 'Open a room' }).click()
  await a.page.waitForURL(/\/room\//, { timeout: 20_000 })
  const roomPath = new URL(a.page.url()).pathname

  // ── A adds a card; B joins and sees it (server→B sync) ─────────────
  await a.page.getByRole('button', { name: 'ADD CARD' }).click()
  await expect(a.page.getByText('Double-click to write')).toBeVisible({ timeout: 10_000 })

  await b.page.goto(roomPath)
  await expect(b.page.getByText('Double-click to write')).toBeVisible({ timeout: 20_000 })

  // ── B opens a poll; both see it; votes stay one-per-user ────────────
  await b.page.getByRole('button', { name: 'NEW POLL' }).click()
  await b.page.getByPlaceholder('What are we deciding?').fill('Ship it?')
  await b.page.getByPlaceholder(/One option per line/).fill('Yes\nNo')
  await b.page.getByRole('button', { name: 'Open the poll' }).click()
  await expect(a.page.getByText('Ship it?', { exact: true })).toBeVisible({ timeout: 10_000 })

  // B votes Yes, then changes to No — still exactly 1 vote total
  await b.page.getByRole('button', { name: /^Yes/ }).click()
  await expect(b.page.getByText(/YOU VOTED · 1\/2 VOTED/)).toBeVisible({ timeout: 10_000 })
  await b.page.getByRole('button', { name: /^No/ }).click()
  await expect(b.page.getByText(/YOU VOTED · 1\/2 VOTED/)).toBeVisible({ timeout: 10_000 })
  // and A sees the same single vote arrive live
  await expect(a.page.getByText(/1\/2 VOTED/).first()).toBeVisible({ timeout: 10_000 })

  // ── A freezes; B sees the banner arrive over sync ───────────────────
  await a.page.getByRole('button', { name: 'FREEZE', exact: true }).click()
  await expect(b.page.getByTestId('frozen-banner')).toBeVisible({ timeout: 10_000 })
  await expect(b.page.getByRole('button', { name: 'ADD CARD' })).toBeDisabled()

  // ── THE server-enforcement proof ────────────────────────────────────
  // B pushes a raw core.put through its own live socket via the dev hook.
  // If enforcement were client-only, this would move the card.
  const cardId = await b.page.evaluate(() => {
    const hook = (window as unknown as Record<string, unknown>).__warroomTest as {
      cards: Array<{ id: string; x: number }>
      putCard: (id: string, patch: Record<string, unknown>) => Promise<void>
    }
    const id = hook.cards[0].id
    void hook.putCard(id, { x: 4242 })
    return id
  })
  // give the round-trip a moment, then assert the card did NOT move for A
  await a.page.waitForTimeout(1500)
  const xSeenByA = await a.page.evaluate((id) => {
    const hook = (window as unknown as Record<string, unknown>).__warroomTest as {
      cards: Array<{ id: string; x: number }>
    }
    return hook.cards.find((c) => c.id === id)?.x
  }, cardId)
  expect(xSeenByA).not.toBe(4242)

  // ── unfreeze: the same raw put now lands (proves the hook works) ────
  await a.page.getByRole('button', { name: 'UNFREEZE' }).click()
  await expect(b.page.getByTestId('frozen-banner')).toHaveCount(0, { timeout: 10_000 })
  await b.page.evaluate((id) => {
    const hook = (window as unknown as Record<string, unknown>).__warroomTest as {
      putCard: (id: string, patch: Record<string, unknown>) => Promise<void>
    }
    void hook.putCard(id, { x: 777 })
  }, cardId)
  await expect
    .poll(
      async () =>
        a.page.evaluate((id) => {
          const hook = (window as unknown as Record<string, unknown>).__warroomTest as {
            cards: Array<{ id: string; x: number }>
          }
          return hook.cards.find((c) => c.id === id)?.x
        }, cardId),
      { timeout: 10_000 },
    )
    .toBe(777)

  // ── decided polls are settled: raw late votes and forged reopens bounce ──
  // A (facilitator) closes B's poll — allowed by the creator-or-facilitator rule
  await a.page.getByRole('button', { name: 'CLOSE', exact: true }).click()
  await expect(b.page.getByText(/RESULT ·/)).toBeVisible({ timeout: 10_000 })

  // B fires a raw vote at the decided poll through its live socket
  await b.page.evaluate(() => {
    const hook = (window as unknown as Record<string, unknown>).__warroomTest as {
      polls: Array<{ id: string }>
      createVote: (data: Record<string, unknown>) => Promise<string>
    }
    void hook.createVote({ pollId: hook.polls[0].id, voterId: 'x', optionIndex: 0 }).catch(() => {})
  })
  // and a raw forged reopen
  await b.page.evaluate(() => {
    const hook = (window as unknown as Record<string, unknown>).__warroomTest as {
      polls: Array<{ id: string }>
      putPoll: (id: string, patch: Record<string, unknown>) => Promise<void>
    }
    void hook.putPoll(hook.polls[0].id, { status: 'open' }).catch(() => {})
  })
  await b.page.waitForTimeout(1500)
  // poll stays decided with the same single vote, in BOTH windows
  await expect(a.page.getByText(/RESULT ·/)).toBeVisible()
  await expect(a.page.getByText(/DECIDED .* 1 VOTED/)).toBeVisible()
  const pollStatusSeenByA = await a.page.evaluate(() => {
    const hook = (window as unknown as Record<string, unknown>).__warroomTest as {
      polls: Array<{ id: string; status?: string }>
    }
    return hook.polls[0]?.status
  })
  expect(pollStatusSeenByA).toBe('closed')

  // ── facilitator may delete a poll they didn't create (schema delete:true
  // narrowed by pollDeleteDenial to creator-or-facilitator) ─────────────
  await a.page.getByRole('button', { name: 'Delete this poll' }).click()
  await expect(a.page.getByText(/RESULT ·/)).toHaveCount(0, { timeout: 10_000 })
  await expect(b.page.getByText(/RESULT ·/)).toHaveCount(0, { timeout: 10_000 })
})
