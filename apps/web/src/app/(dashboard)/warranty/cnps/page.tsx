/**
 * CNPS dashboard (REFACTOR.md US-WA-003 #5).
 *
 * KPIs: avg score, response rate, # responses, # low-score alerts.
 * Charts: SVG distribution bars (count per integer 0-10) + 12-month trend.
 * Table: low-score tickets (score < 7).
 */

import Link from 'next/link'
import type { Metadata } from 'next'
import { desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  cnpsSurveys,
  warrantyTickets,
  accounts,
} from '@third-code-erp/database/schema'

export const metadata: Metadata = { title: 'CNPS Dashboard' }

export default async function CnpsDashboardPage() {
  const profile = await requireUserProfile()

  const surveys = await db
    .select({
      id: cnpsSurveys.id,
      score: cnpsSurveys.score,
      comment: cnpsSurveys.comment,
      sent_at: cnpsSurveys.sent_at,
      responded_at: cnpsSurveys.responded_at,
      ticket_id: cnpsSurveys.ticket_id,
      ticket_number: warrantyTickets.ticket_number,
      account_name: accounts.name,
    })
    .from(cnpsSurveys)
    .innerJoin(warrantyTickets, eq(warrantyTickets.id, cnpsSurveys.ticket_id))
    .leftJoin(accounts, eq(accounts.id, cnpsSurveys.account_id))
    .where(eq(cnpsSurveys.tenant_id, profile.tenantId))
    .orderBy(desc(cnpsSurveys.sent_at))
    .limit(500)

  const responded = surveys.filter((s) => s.responded_at && typeof s.score === 'number')
  const responseRate = surveys.length === 0 ? 0 : (responded.length / surveys.length) * 100
  const avg =
    responded.length === 0
      ? 0
      : responded.reduce((sum, s) => sum + (s.score ?? 0), 0) / responded.length
  const lowScoreCount = responded.filter((s) => (s.score ?? 10) < 7).length

  // Distribution counts 0..10.
  const distribution: number[] = Array.from({ length: 11 }, () => 0)
  for (const s of responded) {
    const k = s.score
    if (typeof k === 'number' && k >= 0 && k <= 10) distribution[k]! += 1
  }
  const distMax = Math.max(1, ...distribution)

  // 12-month trend.
  const now = new Date()
  const months: { label: string; key: string; total: number; count: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.push({
      label: d.toLocaleString('en-PH', { month: 'short' }),
      key,
      total: 0,
      count: 0,
    })
  }
  for (const s of responded) {
    if (!s.responded_at || typeof s.score !== 'number') continue
    const d = new Date(s.responded_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const month = months.find((m) => m.key === key)
    if (month) {
      month.total += s.score
      month.count += 1
    }
  }
  const trendAvgs = months.map((m) => (m.count === 0 ? null : m.total / m.count))
  const trendMax = 10
  const trendW = 700
  const trendH = 160
  const padL = 32
  const padB = 24
  const xStep = (trendW - padL - 12) / Math.max(1, months.length - 1)
  const trendPoints = trendAvgs
    .map((v, i) => {
      if (v === null) return null
      const x = padL + i * xStep
      const y = trendH - padB - (v / trendMax) * (trendH - padB - 8)
      return { x, y, v }
    })
    .filter((p): p is { x: number; y: number; v: number } => p !== null)
  const trendPath = trendPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')

  const lowScoreRows = responded.filter((s) => (s.score ?? 10) < 7).slice(0, 30)

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/warranty" style={{ color: 'inherit' }}>
            ← Back to warranty queue
          </Link>
        </p>
        <h1 className="page-title">CNPS dashboard</h1>
        <p className="page-subtitle">
          Closed-ticket customer satisfaction signals. Score below 7 raises an
          alert to the CX team.
        </p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Kpi label="Avg score" value={avg.toFixed(1)} hint="0–10 NPS scale" />
        <Kpi
          label="Response rate"
          value={`${responseRate.toFixed(0)}%`}
          hint={`${responded.length} of ${surveys.length} sent`}
        />
        <Kpi label="Responses" value={responded.length.toString()} />
        <Kpi
          label="Low-score alerts"
          value={lowScoreCount.toString()}
          tone={lowScoreCount > 0 ? 'danger' : 'normal'}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)',
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Score distribution</h2>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160 }}>
              {distribution.map((count, score) => {
                const heightPct = (count / distMax) * 100
                const tone = score >= 9 ? '#1f7a4d' : score <= 6 ? '#b42318' : '#0F2D4A'
                return (
                  <div
                    key={score}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#525866' }}>{count || ''}</div>
                    <div
                      style={{
                        width: '100%',
                        height: `${Math.max(2, heightPct)}%`,
                        background: tone,
                        opacity: count === 0 ? 0.18 : 1,
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.2s ease',
                      }}
                    />
                  </div>
                )
              })}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#525866',
                marginTop: 6,
                padding: '0 2px',
              }}
            >
              {distribution.map((_, score) => (
                <span key={score} style={{ flex: 1, textAlign: 'center' }}>
                  {score}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">12-month trend (avg score)</h2>
          </div>
          <div style={{ padding: 16 }}>
            <svg
              viewBox={`0 0 ${trendW} ${trendH}`}
              width="100%"
              height={trendH}
              style={{ overflow: 'visible' }}
            >
              {[0, 2, 4, 6, 8, 10].map((v) => {
                const y = trendH - padB - (v / trendMax) * (trendH - padB - 8)
                return (
                  <g key={v}>
                    <line x1={padL} y1={y} x2={trendW} y2={y} stroke="#eef0f4" />
                    <text x={6} y={y + 4} fontSize={10} fill="#737373">
                      {v}
                    </text>
                  </g>
                )
              })}
              {trendPoints.length > 1 && (
                <path d={trendPath} stroke="#0F2D4A" strokeWidth={2} fill="none" />
              )}
              {trendPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill="#0F2D4A" />
              ))}
              {months.map((m, i) => (
                <text
                  key={m.key}
                  x={padL + i * xStep}
                  y={trendH - 6}
                  fontSize={10}
                  fill="#737373"
                  textAnchor="middle"
                >
                  {m.label}
                </text>
              ))}
            </svg>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Low-score tickets ({lowScoreRows.length})</h2>
        </div>
        {lowScoreRows.length === 0 ? (
          <div className="card-empty">No low-score responses. Keep it up.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Account</th>
                <th>Score</th>
                <th>Comment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {lowScoreRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/warranty/${r.ticket_id}`} style={{ color: 'inherit' }}>
                      <strong>{r.ticket_number}</strong>
                    </Link>
                  </td>
                  <td className="muted">{r.account_name ?? '—'}</td>
                  <td>
                    <span
                      style={{
                        color: '#b42318',
                        fontWeight: 600,
                      }}
                    >
                      {r.score}
                    </span>
                  </td>
                  <td className="muted" style={{ maxWidth: 360 }}>
                    {r.comment ? r.comment.slice(0, 160) : '—'}
                  </td>
                  <td className="muted">
                    {r.responded_at
                      ? new Date(r.responded_at).toLocaleDateString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

interface KpiProps {
  label: string
  value: string
  hint?: string
  tone?: 'danger' | 'normal'
}

function Kpi({ label, value, hint, tone }: KpiProps) {
  return (
    <div className="kpi-card">
      <p className="kpi-card-label">{label}</p>
      <p
        className="kpi-card-value"
        style={tone === 'danger' ? { color: 'var(--color-danger)' } : {}}
      >
        {value}
      </p>
      {hint && (
        <p style={{ margin: 0, color: 'var(--color-neutral-600)', fontSize: 12 }}>{hint}</p>
      )}
    </div>
  )
}
