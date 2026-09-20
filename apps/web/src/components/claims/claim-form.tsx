'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CreateClaimDraftCommand } from '@third-code-erp/shared-types'
import { createClaimDraftCommand, type ClaimDraftActionResult } from '@/app/(dashboard)/claims/draft-command-actions'
import { parseClaimAmount } from '@/app/(dashboard)/claims/claim-amount'

interface ProjectOption { id: string; name: string }
interface ClaimFormProps { projects: ProjectOption[]; defaultProjectId?: string; tenantId: string; actorId: string }

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', fontSize: '0.875rem', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'white' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-600)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }

function requestId(): string | undefined {
  try { return typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : undefined } catch { return undefined }
}

export function ClaimForm({ projects, defaultProjectId, tenantId, actorId }: ClaimFormProps) {
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState<'rejected' | 'unknown' | null>(null)
  const [retryCommand, setRetryCommand] = useState<CreateClaimDraftCommand | null>(null)
  const [confirmedClaim, setConfirmedClaim] = useState<{ id: string; claimNumber: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (outcome !== 'unknown') return undefined
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [outcome])

  function dispatch(command: CreateClaimDraftCommand): void {
    startTransition(async () => {
      let result: ClaimDraftActionResult
      try { result = await createClaimDraftCommand({ tenantId, actorId }, command) } catch { result = { ok: false, outcome: 'unknown', error: 'The draft outcome is unconfirmed. Keep this page open and retry the unchanged draft.' } }
      if (result.ok) {
        setError(''); setOutcome(null); setRetryCommand(null)
        setConfirmedClaim({ id: result.receipt.claim.id, claimNumber: result.receipt.claim.claimNumber })
        try { router.push(`/claims/${result.receipt.claim.id}`) } catch { /* confirmed link remains available */ }
        return
      }
      setError(result.error); setOutcome(result.outcome); setRetryCommand(result.outcome === 'unknown' ? command : null)
      // Keep a dispatched key after any server rejection. Replacing it could
      // turn an ambiguous conflict into a second financial record.
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (isPending) return
    setError(''); setOutcome(null)
    const form = new FormData(event.currentTarget)
    const rawMilestone = form.get('milestone_pct')
    const project = form.get('project_id')
    const description = form.get('description')
    const amountCents = parseClaimAmount(form)
    const milestonePct = typeof rawMilestone === 'string' && /^(?:0|[1-9]\d*)$/.test(rawMilestone) ? Number(rawMilestone) : NaN
    if (typeof project !== 'string' || project.length === 0 || !Number.isSafeInteger(milestonePct) || milestonePct < 0 || milestonePct > 100 || amountCents === undefined) {
      setError('Select a project and enter a whole milestone percentage with an exact peso amount (up to two decimals).'); setOutcome('rejected'); return
    }
    const id = requestIdRef.current ?? requestId()
    if (!id) { setError('This browser cannot create a safe request identifier. Refresh or use a current browser.'); setOutcome('rejected'); return }
    requestIdRef.current = id
    const command: CreateClaimDraftCommand = { projectId: project, clientRequestId: id, milestonePct, amountCents, description: typeof description === 'string' && description.length > 0 ? description : null }
    setRetryCommand(command); dispatch(command)
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isPending} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 8, padding: 24, display: 'grid', gap: 16, maxWidth: 720 }}>
      <div><label htmlFor="claim-project" style={labelStyle}>Project</label><select id="claim-project" name="project_id" required defaultValue={defaultProjectId ?? ''} style={inputStyle}><option value="">Select a project…</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div><label htmlFor="claim-milestone" style={labelStyle}>Milestone %</label><input id="claim-milestone" name="milestone_pct" type="number" min={0} max={100} step={1} required placeholder="50" style={inputStyle} /></div>
        <div><label htmlFor="claim-amount" style={labelStyle}>Amount (₱)</label><input id="claim-amount" name="amount_php" inputMode="decimal" required placeholder="1250000.00" autoComplete="off" style={inputStyle} /></div>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)', padding: '10px 12px', background: 'var(--color-neutral-50)', borderRadius: 6, lineHeight: 1.55 }}><strong style={{ color: 'var(--color-neutral-700)' }}>Typical milestones:</strong> 25% form work · 50% rough-in · 75% finishes · 100% turnover.</div>
      <div><label htmlFor="claim-description" style={labelStyle}>Description (optional)</label><textarea id="claim-description" name="description" rows={4} maxLength={5000} placeholder="Scope covered by this claim — e.g. completed 3F-5F rough-in, FCU set including hangers and condensate piping." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} /></div>
      {error ? <div role="alert" aria-live="assertive" style={{ background: outcome === 'unknown' ? 'var(--color-warning-soft)' : 'var(--color-danger-soft)', color: 'var(--color-danger)', padding: '10px 12px', borderRadius: 6, fontSize: '0.8125rem' }}>{error}</div> : null}
      {confirmedClaim ? <div role="status" aria-live="polite" style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)', padding: '10px 12px', borderRadius: 6, fontSize: '0.8125rem' }}>Draft {confirmedClaim.claimNumber} confirmed. <a href={`/claims/${confirmedClaim.id}`}>Open claim</a>.</div> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {outcome === 'unknown' && retryCommand ? <button type="button" disabled={isPending} onClick={() => dispatch(retryCommand)} style={{ background: 'white', color: 'var(--color-navy-700)', border: '1px solid var(--color-border-strong)', borderRadius: 6, padding: '9px 18px', fontSize: '0.875rem', fontWeight: 600 }}>{isPending ? 'Retrying…' : 'Retry unchanged draft'}</button> : null}
        <button type="submit" disabled={isPending || outcome === 'unknown'} style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: '0.875rem', fontWeight: 600, cursor: isPending ? 'wait' : 'pointer', opacity: isPending || outcome === 'unknown' ? 0.7 : 1 }}>{isPending ? 'Saving…' : 'Save as draft'}</button>
      </div>
    </form>
  )
}
