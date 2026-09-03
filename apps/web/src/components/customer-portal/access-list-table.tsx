'use client'

/**
 * AccessListTable — admin view of all customer portal sessions on a
 * project. Allows revocation via the revokeCustomerPortalAccess server
 * action. Status is derived (active / expired / revoked) on the client
 * from `revoked_at` + `expires_at`.
 */

import { useState, useTransition } from 'react'
import { revokeCustomerPortalAccess } from '@/app/(dashboard)/projects/[id]/access/actions'

export interface AccessRow {
  id: string
  viewer_email: string | null
  viewer_name: string | null
  expires_at: string
  revoked_at: string | null
  last_viewed_at: string | null
  view_count: number
  created_at: string
}

interface AccessListTableProps {
  rows: AccessRow[]
  canManage?: boolean
}

type DerivedStatus = 'active' | 'expired' | 'revoked'

const STATUS_TONES: Record<DerivedStatus, { bg: string; fg: string }> = {
  active: { bg: '#0d5c3a', fg: 'white' },
  expired: { bg: '#7a4a00', fg: 'white' },
  revoked: { bg: '#a01818', fg: 'white' },
}

function deriveStatus(row: AccessRow): DerivedStatus {
  if (row.revoked_at) return 'revoked'
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired'
  return 'active'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AccessListTable({ rows, canManage = true }: AccessListTableProps) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleRevoke(id: string) {
    if (!confirm('Revoke this client link? This cannot be undone.')) return
    setError(null)
    setPendingId(id)
    startTransition(async () => {
      const res = await revokeCustomerPortalAccess(id)
      setPendingId(null)
      if (res.error) setError(res.error)
    })
  }

  if (rows.length === 0) {
    return (
      <div style={emptyStyle}>
        <h3 style={{ margin: 0, fontSize: 15, color: 'var(--color-navy-700, #1F3864)' }}>
          No client links yet
        </h3>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-neutral-500, #6b7280)' }}>
          Mint a link above to grant your client read-only access to this project&rsquo;s live status.
        </p>
      </div>
    )
  }

  return (
    <div style={tableContainerStyle}>
      {error ? <p style={errorBannerStyle}>{error}</p> : null}
      <table style={tableStyle}>
        <thead>
          <tr style={{ background: 'var(--color-neutral-50, #fafbfc)' }}>
            <th style={thStyle}>Viewer</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Expires</th>
            <th style={thStyle}>Last viewed</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Views</th>
            <th style={thStyle}>Created</th>
            {canManage && <th style={thStyle} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const status = deriveStatus(row)
            const tone = STATUS_TONES[status]
            const canRevoke = status === 'active'
            return (
              <tr
                key={row.id}
                style={{
                  borderTop: idx === 0 ? 'none' : '1px solid var(--color-border, #e2e6ea)',
                }}
              >
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-navy-700, #1F3864)' }}>
                    {row.viewer_name ?? '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-500, #6b7280)' }}>
                    {row.viewer_email ?? 'no email'}
                  </div>
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      background: tone.bg,
                      color: tone.fg,
                    }}
                  >
                    {status}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: 'var(--color-neutral-700, #3b424b)' }}>
                  {fmtDate(row.expires_at)}
                </td>
                <td style={{ ...tdStyle, color: 'var(--color-neutral-700, #3b424b)' }}>
                  {fmtDate(row.last_viewed_at)}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: 'right',
                    fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                    fontWeight: 600,
                  }}
                >
                  {row.view_count}
                </td>
                <td style={{ ...tdStyle, color: 'var(--color-neutral-700, #3b424b)' }}>
                  {fmtDate(row.created_at)}
                </td>
                {canManage && <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {canRevoke ? (
                    <button
                      type="button"
                      onClick={() => handleRevoke(row.id)}
                      disabled={pendingId === row.id}
                      style={revokeButtonStyle(pendingId === row.id)}
                    >
                      {pendingId === row.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--color-neutral-400, #9ca3af)' }}>—</span>
                  )}
                </td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const tableContainerStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid var(--color-border, #e2e6ea)',
  borderRadius: 10,
  overflow: 'hidden',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-600, #5b6370)',
  borderBottom: '1px solid var(--color-border, #e2e6ea)',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'middle',
}

function revokeButtonStyle(pending: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: 12.5,
    fontWeight: 600,
    color: pending ? 'var(--color-neutral-500, #6b7280)' : '#a01818',
    background: 'white',
    border: '1px solid #a01818',
    borderRadius: 6,
    cursor: pending ? 'not-allowed' : 'pointer',
    opacity: pending ? 0.7 : 1,
  }
}

const emptyStyle: React.CSSProperties = {
  background: 'white',
  border: '1px dashed var(--color-border, #e2e6ea)',
  borderRadius: 10,
  padding: '40px 32px',
  textAlign: 'center',
}

const errorBannerStyle: React.CSSProperties = {
  margin: 0,
  padding: '10px 14px',
  background: '#fdecec',
  color: '#a01818',
  fontSize: 12.5,
  borderBottom: '1px solid #f5c4c4',
}
