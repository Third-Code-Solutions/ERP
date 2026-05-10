'use client'

import { Fragment, useState, useTransition } from 'react'
import { formatCentsCompact } from '@buildops/shared-types'
import { createOpportunity, transitionStage } from '@/app/(dashboard)/projects/[id]/opportunities/actions'

const STAGE_ORDER = [
  'opportunity_creation',
  'scoping',
  'bom_submission',
  'resubmission',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const

type Stage = typeof STAGE_ORDER[number]

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

const VALID_TRANSITIONS: Record<Stage, Stage[]> = {
  opportunity_creation: ['scoping', 'closed_lost'],
  scoping: ['bom_submission', 'closed_lost'],
  bom_submission: ['resubmission', 'negotiation', 'closed_lost'],
  resubmission: ['bom_submission', 'negotiation', 'closed_lost'],
  negotiation: ['closed_won', 'closed_lost', 'resubmission'],
  closed_won: [],
  closed_lost: [],
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
  projectId: string
  opportunities: Opportunity[]
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 500,
  color: 'var(--color-neutral-600)',
  marginBottom: '4px',
}

export function OpportunityPanel({ projectId, opportunities: initialOpps }: OpportunityPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [stagingOppId, setStagingOppId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('project_id', projectId)
    startTransition(async () => {
      try {
        await createOpportunity(fd)
        setShowCreateForm(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create opportunity')
      }
    })
  }

  function handleTransition(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await transitionStage(fd)
        setStagingOppId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update stage')
      }
    })
  }

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
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          style={{
            fontSize: '0.8125rem',
            padding: '4px 12px',
            background: 'var(--color-navy-700)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {showCreateForm ? 'Cancel' : '+ Add Opportunity'}
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreate} style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-neutral-50)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Stage</label>
              <select name="stage" style={{ ...inputStyle, background: 'white' }}>
                {STAGE_ORDER.filter(s => s !== 'closed_won' && s !== 'closed_lost').map(s => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <input name="opportunity_type" type="text" style={inputStyle} placeholder="MEP, Fit-out…" />
            </div>
            <div>
              <label style={labelStyle}>Area (sqm)</label>
              <input name="area_sqm" type="number" min="1" style={inputStyle} placeholder="1200" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>TCV (₱ centavos)</label>
              <input name="tcv_cents" type="number" min="0" step="100" style={inputStyle} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>GP (₱ centavos)</label>
              <input name="gp_cents" type="number" min="0" step="100" style={inputStyle} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Est. Close</label>
              <input name="closing_date" type="date" style={inputStyle} />
            </div>
          </div>
          {error && (
            <div style={{ color: '#dc2626', fontSize: '0.8125rem', marginBottom: '12px' }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={isPending}
            style={{
              padding: '6px 16px',
              background: isPending ? '#94a3b8' : 'var(--color-navy-700)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.8125rem',
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Creating…' : 'Create Opportunity'}
          </button>
        </form>
      )}

      {initialOpps.length === 0 && !showCreateForm ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.875rem' }}>
          No opportunities yet. Add one to begin tracking this deal in the pipeline.
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
              {initialOpps.map((opp) => {
                const stage = opp.stage as Stage
                const gpPct = opp.tcv_cents > 0 ? ((opp.gp_cents / opp.tcv_cents) * 100).toFixed(1) : '—'
                const isStaging = stagingOppId === opp.id
                const nextStages = VALID_TRANSITIONS[stage] ?? []

                return (
                  <Fragment key={opp.id}>
                    <tr>
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
                      <td>
                        {nextStages.length > 0 && (
                          <button
                            onClick={() => setStagingOppId(isStaging ? null : opp.id)}
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 8px',
                              border: '1px solid var(--color-border)',
                              borderRadius: '4px',
                              background: 'none',
                              cursor: 'pointer',
                              color: 'var(--color-navy-700)',
                            }}
                          >
                            {isStaging ? 'Cancel' : 'Advance'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isStaging && (
                      <tr key={`${opp.id}-transition`}>
                        <td colSpan={9} style={{ background: 'var(--color-navy-50, #eef4fc)', padding: '12px 20px' }}>
                          <form onSubmit={handleTransition}>
                            <input type="hidden" name="opportunity_id" value={opp.id} />
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div>
                                <label style={labelStyle}>Move to stage</label>
                                <select name="new_stage" style={{ ...inputStyle, width: 'auto' }}>
                                  {nextStages.map(s => (
                                    <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={labelStyle}>Updated TCV (¢)</label>
                                <input name="tcv_cents" type="number" min="0" defaultValue={opp.tcv_cents} style={{ ...inputStyle, width: '140px' }} />
                              </div>
                              <div>
                                <label style={labelStyle}>Updated GP (¢)</label>
                                <input name="gp_cents" type="number" min="0" defaultValue={opp.gp_cents} style={{ ...inputStyle, width: '140px' }} />
                              </div>
                              <button
                                type="submit"
                                disabled={isPending}
                                style={{
                                  padding: '6px 14px',
                                  background: isPending ? '#94a3b8' : 'var(--color-navy-700)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '0.8125rem',
                                  cursor: isPending ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {isPending ? 'Saving…' : 'Confirm transition'}
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
