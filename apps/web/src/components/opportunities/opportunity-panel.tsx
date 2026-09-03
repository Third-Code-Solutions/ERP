'use client'

import { Fragment, useRef, useState, useTransition } from 'react'
import {
  formatCentsCompact,
  STAGE_LEGACY_MAP,
  type OpportunityStage,
  type PipelineStage,
} from '@third-code-erp/shared-types'

import {
  createOpportunity,
  transitionStage,
} from '@/app/(dashboard)/projects/[id]/opportunities/actions'
import { LostReasonDialog } from '@/components/pipeline/lost-reason-dialog'
import { RegressionReasonDialog } from '@/components/pipeline/regression-reason-dialog'
import { createStageTransitionSubmitter } from '@/components/pipeline/stage-transition-action'

import {
  buildOpportunityCreateFormData,
  buildOpportunityTransitionFormData,
  classifyOpportunityPanelDestination,
  createOpportunityPanelActionSubmitter,
  getOpportunityPanelDestinations,
  isOpportunityStage,
  type OpportunityPanelDestinationKind,
} from './opportunity-panel-model'

const CREATE_STAGES = [
  'opportunity_creation',
  'scoping',
  'bom_submission',
  'resubmission',
  'negotiation',
] as const satisfies readonly OpportunityStage[]

const STAGE_LABELS: Record<OpportunityStage, string> = {
  opportunity_creation: 'Opportunity Creation',
  scoping: 'Scoping',
  resubmission: 'Resubmission',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  lead: 'Lead',
  site_survey: 'Site Survey',
  design: 'Design',
  bom_submission: 'BOM Submission',
  negotiation: 'Negotiation',
  contract: 'Contract',
  won: 'Won',
  lost: 'Lost',
}

const STAGE_COLORS: Record<PipelineStage, string> = {
  lead: '#6366f1',
  site_survey: '#8b5cf6',
  design: '#0ea5e9',
  bom_submission: '#f59e0b',
  negotiation: '#10b981',
  contract: '#0f766e',
  won: '#16a34a',
  lost: '#dc2626',
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
  canCreate: boolean
  canMutate: boolean
}

interface TransitionDraft {
  controls: FormData
  destination: OpportunityStage
  kind: OpportunityPanelDestinationKind
  opportunity: Opportunity
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

const unexpectedCreateError =
  'Opportunity creation could not be completed. Please try again.'

function dateInputValue(value: Date | null): string | undefined {
  if (!value) return undefined
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value
  const year = part('year')
  const month = part('month')
  const day = part('day')
  return year && month && day ? `${year}-${month}-${day}` : undefined
}

function stageLabel(stage: string): string {
  return isOpportunityStage(stage) ? STAGE_LABELS[stage] : stage
}

function stageColor(stage: string): string {
  return isOpportunityStage(stage)
    ? STAGE_COLORS[STAGE_LEGACY_MAP[stage]]
    : '#6b7280'
}

export function OpportunityPanel({
  projectId,
  opportunities: initialOpps,
  canCreate,
  canMutate,
}: OpportunityPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [stagingOppId, setStagingOppId] = useState<string | null>(null)
  const [pendingTransition, setPendingTransition] =
    useState<TransitionDraft | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const submissionInFlightRef = useRef(false)
  const transitionSubmitterRef = useRef<ReturnType<
    typeof createStageTransitionSubmitter
  > | null>(null)
  const createSubmitterRef = useRef<ReturnType<
    typeof createOpportunityPanelActionSubmitter
  > | null>(null)
  transitionSubmitterRef.current ??= createStageTransitionSubmitter()
  createSubmitterRef.current ??=
    createOpportunityPanelActionSubmitter(unexpectedCreateError)

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate || submissionInFlightRef.current) return

    const command = buildOpportunityCreateFormData(
      new FormData(event.currentTarget),
      projectId
    )
    submissionInFlightRef.current = true
    setError(null)
    startTransition(() =>
      createSubmitterRef.current!
        .submit(() => createOpportunity(command), {
          onStart: () => undefined,
          onError: setError,
          onSuccess: () => setShowCreateForm(false),
        })
        .finally(() => {
          submissionInFlightRef.current = false
        })
        .then(() => undefined)
    )
  }

  function submitTransition(
    draft: TransitionDraft,
    reason?: string,
    reasonRequired = false
  ) {
    if (!canMutate || submissionInFlightRef.current) return

    const command = buildOpportunityTransitionFormData(draft.controls, {
      projectId,
      opportunityId: draft.opportunity.id,
      destination: draft.destination,
      reason,
    })
    submissionInFlightRef.current = true
    setError(null)
    startTransition(() =>
      transitionSubmitterRef.current!
        .submit(
          {
            execute: () => transitionStage(command),
            reason,
            reasonRequired,
          },
          {
            onStart: () => undefined,
            onError: setError,
            onSuccess: () => {
              setStagingOppId(null)
              setPendingTransition(null)
            },
          }
        )
        .finally(() => {
          submissionInFlightRef.current = false
        })
        .then(() => undefined)
    )
  }

  function handleTransition(
    event: React.FormEvent<HTMLFormElement>,
    opportunity: Opportunity
  ) {
    event.preventDefault()
    if (!canMutate || submissionInFlightRef.current) return

    const controls = new FormData(event.currentTarget)
    const rawDestination = controls.get('new_stage')
    if (typeof rawDestination !== 'string') {
      setError('Select an allowed destination stage.')
      return
    }
    const kind = classifyOpportunityPanelDestination(
      opportunity.stage,
      rawDestination
    )
    if (!kind || !isOpportunityStage(rawDestination)) {
      setError('Select an allowed destination stage.')
      return
    }

    const draft = {
      controls,
      destination: rawDestination,
      kind,
      opportunity,
    } satisfies TransitionDraft
    setError(null)
    if (kind === 'lost' || kind === 'regression') {
      setPendingTransition(draft)
      return
    }
    submitTransition(draft)
  }

  function confirmLost(reason: string) {
    if (pendingTransition?.kind !== 'lost') return
    submitTransition(pendingTransition, reason, true)
  }

  function confirmRegression(reason: string) {
    if (pendingTransition?.kind !== 'regression') return
    submitTransition(pendingTransition, reason, true)
  }

  function cancelReasonDialog() {
    if (!isPending) setPendingTransition(null)
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0 }}>
          Pipeline Opportunities
        </h3>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setShowCreateForm((visible) => !visible)}
            disabled={isPending}
            style={{
              fontSize: '0.8125rem',
              padding: '4px 12px',
              background: 'var(--color-navy-700)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {showCreateForm ? 'Cancel' : '+ Add Opportunity'}
          </button>
        ) : (
          <p role="status" style={readOnlyStyle}>
            Opportunity data is read-only.
          </p>
        )}
      </div>

      {error ? (
        <p role="alert" style={alertStyle(pendingTransition !== null)}>
          {error}
        </p>
      ) : null}

      {canCreate && showCreateForm ? (
        <form
          aria-label="Create opportunity"
          onSubmit={handleCreate}
          style={createFormStyle}
        >
          <div style={formGridStyle}>
            <div>
              <label htmlFor="new-opportunity-stage" style={labelStyle}>Stage</label>
              <select id="new-opportunity-stage" name="stage" style={{ ...inputStyle, background: 'white' }}>
                {CREATE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-opportunity-type" style={labelStyle}>Type</label>
              <input id="new-opportunity-type" name="opportunity_type" type="text" style={inputStyle} placeholder="MEP, Fit-out…" />
            </div>
            <div>
              <label htmlFor="new-opportunity-area" style={labelStyle}>Area (sqm)</label>
              <input id="new-opportunity-area" name="area_sqm" type="number" min="1" style={inputStyle} placeholder="1200" />
            </div>
          </div>
          <div style={formGridStyle}>
            <div>
              <label htmlFor="new-opportunity-tcv" style={labelStyle}>TCV (₱ centavos)</label>
              <input id="new-opportunity-tcv" name="tcv_cents" type="number" min="0" step="100" style={inputStyle} placeholder="0" />
            </div>
            <div>
              <label htmlFor="new-opportunity-gp" style={labelStyle}>GP (₱ centavos)</label>
              <input id="new-opportunity-gp" name="gp_cents" type="number" step="100" style={inputStyle} placeholder="0" />
            </div>
            <div>
              <label htmlFor="new-opportunity-close" style={labelStyle}>Est. Close</label>
              <input id="new-opportunity-close" name="closing_date" type="date" style={inputStyle} />
            </div>
          </div>
          <button type="submit" disabled={isPending} style={submitButtonStyle(isPending)}>
            {isPending ? 'Creating…' : 'Create Opportunity'}
          </button>
        </form>
      ) : null}

      {initialOpps.length === 0 && !showCreateForm ? (
        <div style={emptyStyle}>
          {canCreate
            ? 'No opportunities yet. Add one to begin tracking this deal in the pipeline.'
            : 'No opportunities yet.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Stage</th><th>Type</th><th className="numeric">TCV</th>
                <th className="numeric">GP</th><th className="numeric">GP%</th>
                <th className="numeric">Prob</th><th className="numeric">Weighted</th>
                <th>Est. Close</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialOpps.map((opportunity) => {
                const gpPercent = opportunity.tcv_cents > 0
                  ? ((opportunity.gp_cents / opportunity.tcv_cents) * 100).toFixed(1)
                  : '—'
                const isStaging = canMutate && stagingOppId === opportunity.id
                const destinations = getOpportunityPanelDestinations(opportunity.stage)
                const color = stageColor(opportunity.stage)

                return (
                  <Fragment key={opportunity.id}>
                    <tr>
                      <td><span className="stage-badge" style={{ color, background: `${color}18` }}>{stageLabel(opportunity.stage)}</span></td>
                      <td style={{ color: 'var(--color-neutral-500)' }}>{opportunity.opportunity_type ?? '—'}</td>
                      <td className="currency">{opportunity.tcv_cents > 0 ? formatCentsCompact(opportunity.tcv_cents) : '—'}</td>
                      <td className="currency">{opportunity.gp_cents !== 0 ? formatCentsCompact(opportunity.gp_cents) : '—'}</td>
                      <td className="numeric" style={{ color: Number(gpPercent) >= 20 ? 'var(--color-success)' : 'inherit' }}>{gpPercent !== '—' ? `${gpPercent}%` : '—'}</td>
                      <td className="numeric">{opportunity.probability}%</td>
                      <td className="currency">{opportunity.weighted_tcv_cents > 0 ? formatCentsCompact(opportunity.weighted_tcv_cents) : '—'}</td>
                      <td style={dateCellStyle}>{opportunity.closing_date ? new Date(opportunity.closing_date).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                      <td>
                        {canMutate && destinations.length > 0 ? (
                          <button type="button" onClick={() => setStagingOppId(isStaging ? null : opportunity.id)} disabled={isPending} style={advanceButtonStyle(isPending)}>
                            {isStaging ? 'Cancel' : 'Advance'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {isStaging ? (
                      <tr key={`${opportunity.id}-transition`}>
                        <td colSpan={9} style={transitionCellStyle}>
                          <form aria-label={`Advance ${stageLabel(opportunity.stage)} opportunity`} onSubmit={(event) => handleTransition(event, opportunity)}>
                            <input type="hidden" name="project_id" value={projectId} />
                            <input type="hidden" name="opportunity_id" value={opportunity.id} />
                            <div style={transitionFormStyle}>
                              <div>
                                <label htmlFor={`destination-${opportunity.id}`} style={labelStyle}>Move to stage</label>
                                <select id={`destination-${opportunity.id}`} name="new_stage" style={{ ...inputStyle, width: 'auto' }}>
                                  {destinations.map((destination) => <option key={destination} value={destination}>{stageLabel(destination)}</option>)}
                                </select>
                              </div>
                              <div>
                                <label htmlFor={`tcv-${opportunity.id}`} style={labelStyle}>Updated TCV (¢)</label>
                                <input id={`tcv-${opportunity.id}`} name="tcv_cents" type="number" min="0" defaultValue={opportunity.tcv_cents} style={{ ...inputStyle, width: '140px' }} />
                              </div>
                              <div>
                                <label htmlFor={`gp-${opportunity.id}`} style={labelStyle}>Updated GP (¢)</label>
                                <input id={`gp-${opportunity.id}`} name="gp_cents" type="number" defaultValue={opportunity.gp_cents} style={{ ...inputStyle, width: '140px' }} />
                              </div>
                              <div>
                                <label htmlFor={`close-${opportunity.id}`} style={labelStyle}>Est. Close</label>
                                <input id={`close-${opportunity.id}`} name="closing_date" type="date" defaultValue={dateInputValue(opportunity.closing_date)} style={{ ...inputStyle, width: '150px' }} />
                              </div>
                              <button type="submit" disabled={isPending} style={submitButtonStyle(isPending)}>
                                {isPending ? 'Saving…' : 'Continue transition'}
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <LostReasonDialog open={pendingTransition?.kind === 'lost'} isSubmitting={isPending} onCancel={cancelReasonDialog} onConfirm={confirmLost} />
      <RegressionReasonDialog
        open={pendingTransition?.kind === 'regression'}
        fromLabel={pendingTransition ? stageLabel(pendingTransition.opportunity.stage) : ''}
        toLabel={pendingTransition ? stageLabel(pendingTransition.destination) : ''}
        isSubmitting={isPending}
        onCancel={cancelReasonDialog}
        onConfirm={confirmRegression}
      />
    </div>
  )
}

const panelStyle: React.CSSProperties = { background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }
const readOnlyStyle: React.CSSProperties = { margin: 0, color: 'var(--color-neutral-500)', fontSize: '0.75rem' }
const createFormStyle: React.CSSProperties = { padding: '16px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-neutral-50)' }
const formGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginBottom: '12px' }
const transitionFormStyle: React.CSSProperties = { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }
const transitionCellStyle: React.CSSProperties = { background: 'var(--color-navy-50, #eef4fc)', padding: '12px 20px' }
const dateCellStyle: React.CSSProperties = { fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }
const emptyStyle: React.CSSProperties = { padding: '32px 20px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.875rem' }

function alertStyle(overDialog: boolean): React.CSSProperties {
  return { position: overDialog ? 'fixed' : undefined, top: overDialog ? '16px' : undefined, left: overDialog ? '50%' : undefined, transform: overDialog ? 'translateX(-50%)' : undefined, zIndex: overDialog ? 201 : undefined, margin: overDialog ? 0 : '12px 20px 0', padding: '8px 12px', borderRadius: '6px', background: '#fef2f2', color: 'var(--color-danger, #b91c1c)', fontSize: '0.8125rem' }
}

function submitButtonStyle(isPending: boolean): React.CSSProperties {
  return { padding: '6px 14px', background: isPending ? '#94a3b8' : 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.8125rem', cursor: isPending ? 'not-allowed' : 'pointer' }
}

function advanceButtonStyle(isPending: boolean): React.CSSProperties {
  return { fontSize: '0.75rem', padding: '2px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'none', cursor: isPending ? 'not-allowed' : 'pointer', color: 'var(--color-navy-700)', opacity: isPending ? 0.6 : 1 }
}
