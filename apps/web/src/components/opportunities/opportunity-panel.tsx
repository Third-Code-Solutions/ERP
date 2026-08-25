import Link from 'next/link'
import { formatCentsCompact } from '@third-code-erp/shared-types'

type Stage =
  | 'opportunity_creation'
  | 'scoping'
  | 'bom_submission'
  | 'resubmission'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost'

const STAGE_LABELS: Record<Stage, string> = {
  opportunity_creation: 'Opportunity Creation',
  scoping: 'Scoping',
  bom_submission: 'BOM Submission',
  resubmission: 'Resubmission',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
}

const STAGE_COLORS: Record<Stage, string> = {
  opportunity_creation: '#6366f1',
  scoping: '#8b5cf6',
  bom_submission: '#f59e0b',
  resubmission: '#f97316',
  negotiation: '#10b981',
  closed_won: '#16a34a',
  closed_lost: '#dc2626',
}

interface Opportunity {
  id: string
  stage: string
  tcv_cents: number
  gp_cents: number
  probability: number
  weighted_tcv_cents: number
  closing_date: Date | null
  area_sqm: number | null
  opportunity_type: string | null
}

interface OpportunityPanelProps {
  opportunities: Opportunity[]
}
export function OpportunityPanel({ opportunities }: OpportunityPanelProps) {
  return (
    <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0 }}>
          Pipeline Opportunities
        </h3>
        <Link
          href="/pipeline/board"
          style={{
            fontSize: '0.8125rem',
            padding: '4px 12px',
            background: 'var(--color-navy-700)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            textDecoration: 'none',
          }}
        >
          Open Sales Pipeline
        </Link>
      </div>

      {opportunities.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.875rem' }}>
          This delivery project has no linked sales opportunity. New opportunities and stage changes are managed from the Sales Pipeline.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Type</th>
                <th className="numeric">TCV</th>
                <th className="numeric">GP</th>
                <th className="numeric">GP%</th>
                <th className="numeric">Prob</th>
                <th className="numeric">Weighted</th>
                <th>Est. Close</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp) => {
                const stage = opp.stage as Stage
                const gpPct = opp.tcv_cents > 0 ? ((opp.gp_cents / opp.tcv_cents) * 100).toFixed(1) : '—'
                return (
                  <tr key={opp.id}>
                      <td>
                        <span className="stage-badge" style={{
                          color: STAGE_COLORS[stage] ?? 'inherit',
                          background: (STAGE_COLORS[stage] ?? '#6b7280') + '18',
                        }}>
                          {STAGE_LABELS[stage] ?? stage}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-neutral-500)' }}>{opp.opportunity_type ?? '—'}</td>
                      <td className="currency">{opp.tcv_cents > 0 ? formatCentsCompact(opp.tcv_cents) : '—'}</td>
                      <td className="currency">{opp.gp_cents > 0 ? formatCentsCompact(opp.gp_cents) : '—'}</td>
                      <td className="numeric" style={{ color: Number(gpPct) >= 20 ? 'var(--color-success)' : 'inherit' }}>
                        {gpPct !== '—' ? `${gpPct}%` : '—'}
                      </td>
                      <td className="numeric">{opp.probability}%</td>
                      <td className="currency">{opp.weighted_tcv_cents > 0 ? formatCentsCompact(opp.weighted_tcv_cents) : '—'}</td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>
                        {opp.closing_date
                          ? new Date(opp.closing_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td>Manage in Sales Pipeline</td>
                    </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
