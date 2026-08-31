/**
 * Audit trail viewer — internal, admin-only. RBAC does the gating: the
 * `audit` collection is `read: admin` server-side, so non-admins get an
 * empty list no matter what this page renders. The proper admin portal is
 * future work; this makes the trail reviewable today.
 */

import { useQuery } from 'deepspace'

type AuditData = {
  at: number
  kind: string
  name: string
  userId?: string
  userName?: string
  roomId?: string
  ok?: number
  detail?: string
}

export default function AuditPage() {
  const { records, status } = useQuery<AuditData>('audit', {
    orderBy: 'at',
    orderDir: 'desc',
    limit: 200,
  })

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="wire text-chrome">ADMIN · INTERNAL</div>
      <h1 className="mt-1 font-serif text-4xl text-foreground">Audit trail</h1>

      {status === 'ready' && records.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          Nothing here — either no events yet, or you are not an admin (this collection is
          server-side admin-read only).
        </p>
      )}

      <div className="mt-8 flex flex-col gap-1.5">
        {records.map((r) => (
          <div
            key={r.recordId}
            className={`rounded-sm border px-4 py-2.5 ${r.data.ok === 0 ? 'border-destructive/40' : 'border-border'}`}
          >
            <div className="wire flex flex-wrap items-baseline gap-x-3 text-chrome">
              <span className="text-live">{new Date(r.data.at).toLocaleTimeString()}</span>
              <span className={r.data.ok === 0 ? 'text-destructive' : 'text-foreground'}>
                {r.data.kind.toUpperCase()} · {r.data.name.toUpperCase()}
              </span>
              {r.data.userName && <span>{r.data.userName.toUpperCase()}</span>}
              {r.data.roomId && <span>ROOM {r.data.roomId.slice(0, 12)}</span>}
              <span>{r.data.ok === 0 ? 'FAILED' : 'OK'}</span>
            </div>
            {r.data.detail && (
              <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                {r.data.detail}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
