'use client'

import React, { useLayoutEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { projectDocumentRowSchema, type ProjectDocumentRow, type QualityHoldPointRow } from '@third-code-erp/shared-types'
import { handoffQualityHoldPointToPunchlist, type QualityPunchlistHandoffActionState } from './actions'
import { QualityDocumentPicker } from './quality-document-picker'

export interface QualityPunchlistHandoffFormProps {
  projectId: string
  row: QualityHoldPointRow
  owner: { actorId: string; tenantId: string }
}
const receiptSchema = z.object({ projectId: z.string().uuid(), entryId: z.string().uuid(), clientRequestId: z.string().uuid(), actorId: z.string().uuid(), tenantId: z.string().uuid() }).strict()
type Receipt = z.infer<typeof receiptSchema>
const responseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), outcome: z.literal('confirmed'), success: z.string().min(1), receipt: receiptSchema, refreshWarning: z.string().optional() }).strict(),
  z.object({ ok: z.literal(false), outcome: z.enum(['rejected', 'unknown']), error: z.string().min(1) }).strict(),
])
const UNKNOWN = { ok: false, outcome: 'unknown', error: 'The handoff outcome could not be confirmed. Retry the same request to check it.' } as const

export function interpretHandoffResponse(response: unknown, expected: Receipt, previouslyUnknown: boolean): QualityPunchlistHandoffActionState {
  const parsed = responseSchema.safeParse(response)
  if (!parsed.success) return UNKNOWN
  if (!parsed.data.ok) return { ...parsed.data, outcome: previouslyUnknown ? 'unknown' : parsed.data.outcome }
  const receipt = parsed.data.receipt
  return receipt.projectId === expected.projectId && receipt.entryId === expected.entryId
    && receipt.clientRequestId === expected.clientRequestId && receipt.actorId === expected.actorId
    && receipt.tenantId === expected.tenantId ? parsed.data : UNKNOWN
}

export function captureHandoffFields(formData: FormData): Array<[string, string]> {
  return Array.from(formData.entries()).map(([key, value]) => {
    if (typeof value !== 'string') throw new Error('Only text handoff fields are supported.')
    return [key, value]
  })
}

export function QualityPunchlistHandoffForm(props: QualityPunchlistHandoffFormProps) {
  return <HandoffScope key={`${props.owner.actorId}|${props.owner.tenantId}|${props.projectId}|${props.row.id}`} {...props} />
}

function HandoffScope({ projectId, row, owner }: QualityPunchlistHandoffFormProps) {
  const [clientRequestId, setClientRequestId] = useState('')
  const [document, setDocument] = useState<ProjectDocumentRow | null>(null)
  const [state, setState] = useState<QualityPunchlistHandoffActionState | null>(null)
  const [pending, setPending] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const command = useRef<Array<[string, string]> | null>(null)
  const inFlight = useRef(false)
  const uncertain = useRef(false)
  const mounted = useRef(false)
  const confirmed = useRef(false)
  useLayoutEffect(() => {
    mounted.current = true
    setClientRequestId(crypto.randomUUID())
    return () => { mounted.current = false }
  }, [])
  const validDocument = document === null || (projectDocumentRowSchema.safeParse(document).success && document.projectId.toLowerCase() === projectId.toLowerCase())
  const validScope = row.projectId === projectId
  const frozen = captured || pending || state?.ok === true

  async function dispatch(fields: Array<[string, string]>): Promise<void> {
    if (!mounted.current || inFlight.current || confirmed.current) return
    inFlight.current = true
    setPending(true)
    setLocalError(null)
    const data = new FormData()
    for (const [key, value] of fields) data.append(key, value)
    const expected = { ...owner, projectId, entryId: row.id, clientRequestId }
    let response: unknown
    try {
      response = await handoffQualityHoldPointToPunchlist({ ok: true }, data, owner)
    } catch { response = null }
    if (!mounted.current) return
    const outcome = interpretHandoffResponse(response, expected, uncertain.current)
    if (outcome.ok) confirmed.current = true
    else if (outcome.outcome === 'unknown') uncertain.current = true
    setState(outcome)
    inFlight.current = false
    setPending(false)
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (inFlight.current || command.current || confirmed.current || !mounted.current) return
    if (!validDocument || !validScope) { setLocalError('Clear or replace the invalid project document before submitting.'); return }
    if (!clientRequestId) return
    try {
      const fields = captureHandoffFields(new FormData(event.currentTarget))
      command.current = fields
      setCaptured(true)
      void dispatch(fields)
    } catch { setLocalError('The handoff fields could not be captured. Nothing was sent.') }
  }

  function review(): void {
    if (inFlight.current || uncertain.current || state?.ok !== false || state.outcome !== 'rejected') return
    command.current = null
    setCaptured(false)
    setClientRequestId(crypto.randomUUID())
    setState(null)
    setLocalError(null)
  }

  return <details>
    <summary className="button-primary" style={{ cursor: 'pointer' }}>Create punchlist work</summary>
    <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface-subtle)' }}>
      <div className="form-help">Source evidence from {row.iwrNumber} is retained with the handoff.</div>
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        {row.findings ? <div><strong>Findings:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{row.findings}</span></div> : null}
        <div><strong>Correction required:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{row.rejectionReason}</span></div>
        <div><strong>Plan reference:</strong> {row.planReference || '—'}</div>
      </div>
    </div>
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="entryId" value={row.id} /><input type="hidden" name="clientRequestId" value={clientRequestId} />
      <label className="form-label">Punchlist corrections <span className="form-help">one item per line</span><textarea className="form-input" name="descriptions" required minLength={3} maxLength={10000} rows={3} defaultValue={row.rejectionReason} placeholder="Describe each correction to track to closure." disabled={frozen} /></label>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
        <label className="form-label">Trade<input className="form-input" name="trade" maxLength={120} placeholder={row.discipline || 'Trade'} disabled={frozen} /></label>
        <label className="form-label">Location<input className="form-input" name="location" maxLength={255} defaultValue={row.location} disabled={frozen} /></label>
        <label className="form-label">Priority<select className="form-input" name="priority" defaultValue="medium" disabled={frozen}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label className="form-label">Due date<input className="form-input" name="dueDate" type="date" disabled={frozen} /></label>
      </div>
      <QualityDocumentPicker projectId={projectId} value={document} onChange={value => { if (!command.current && !inFlight.current) setDocument(value) }} disabled={frozen} />
      <label className="form-label">Assigned party<input className="form-input" name="assignedToText" maxLength={255} placeholder="Subcontractor or responsible party" disabled={frozen} /></label>
      {!validScope ? <p role="alert">The IWR does not belong to this project. Reload the correct project.</p> : null}
      {!validDocument || localError ? <p role="alert">{localError ?? 'Clear or replace the invalid project document before submitting.'}</p> : null}
      {!captured ? <button type="submit" className="button-primary" disabled={!clientRequestId || pending || !validDocument || !validScope}>Create punchlist items</button> : null}
      {pending ? <p role="status">Creating punchlist items…</p> : null}
      {state?.ok === false ? <>
        <p role="alert">{state.error}</p>
        {state.outcome === 'unknown' ? <p className="form-help">The submitted fields are frozen because this request may already be committed. Retry sends the exact same command.</p> : null}
        <button type="button" className="button-primary" disabled={pending} onClick={() => { if (command.current) void dispatch(command.current) }}>Retry same handoff</button>
        {state.outcome === 'rejected' && !uncertain.current ? <button type="button" className="button-secondary" disabled={pending} onClick={review}>Review and edit rejected request</button> : null}
      </> : null}
      {state?.ok === true ? <><p role="status">{state.success}</p>{state.refreshWarning ? <p role="status">{state.refreshWarning}</p> : null}</> : null}
      <span className="form-help">One handoff per rejected IWR. Retrying reuses the submitted request token and fields.</span>
    </form>
  </details>
}
