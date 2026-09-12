'use client'

import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  awardLockedBom,
  reverseAwardHandoff,
} from '@/app/(dashboard)/projects/[id]/bom/award-actions'

interface ExistingHandoff {
  id: string
  status: 'active' | 'reversed'
  projectCode: string
  budgetId: string
  dpInvoiceId: string
  projectTrackerId: string
  taskIds: Record<string, string>
}

export interface AwardAutomationPanelProps {
  projectId: string
  bomId: string
  projectCode: string | null
  handoff: ExistingHandoff | null
}

type AwardResult = Awaited<ReturnType<typeof awardLockedBom>>
type ReverseResult = Awaited<ReturnType<typeof reverseAwardHandoff>>
type OperationKind = 'award' | 'reverse'
type Operation = { kind: OperationKind; formData: FormData }
type OperationState = { operation: Operation; phase: 'pending' | 'unknown' }
type Notice = { kind: 'success' | 'error' | 'unknown'; message: string }
const defaultReversalReason = 'Commercial award requires correction'

const taskLabels: Array<[string, string]> = [
  ['arProjectCode', 'AR / project code'],
  ['downPaymentInvoice', 'Down-payment invoice'],
  ['cari', 'CARI'],
  ['projectTracker', 'Project Tracker'],
  ['cxOnboarding', 'CX onboarding'],
]

export function AwardAutomationPanel({
  projectId,
  bomId,
  projectCode,
  handoff,
}: AwardAutomationPanelProps) {
  const scopeKey = `${projectId}:${bomId}:${handoff?.id ?? 'none'}:${handoff?.status ?? 'none'}`

  return (
    <AwardAutomationPanelContent
      key={scopeKey}
      projectId={projectId}
      bomId={bomId}
      projectCode={projectCode}
      handoff={handoff}
    />
  )
}

function AwardAutomationPanelContent({
  projectId,
  bomId,
  projectCode,
  handoff,
}: AwardAutomationPanelProps) {
  const router = useRouter()
  const [operationState, setOperationState] = useState<OperationState | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [downPaymentPercent, setDownPaymentPercent] = useState('0')
  const [reversalReason, setReversalReason] = useState(defaultReversalReason)
  const operationRef = useRef<OperationState | null>(null)
  const epochRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      epochRef.current += 1
      operationRef.current = null
    }
  }, [])

  const isCurrent = (operation: Operation, epoch: number): boolean =>
    mountedRef.current && epochRef.current === epoch && operationRef.current?.operation === operation

  const markUnknown = (operation: Operation, epoch: number) => {
    if (!isCurrent(operation, epoch)) return

    const nextState: OperationState = { operation, phase: 'unknown' }
    operationRef.current = nextState
    setOperationState(nextState)
    setNotice({
      kind: 'unknown',
      message: `${operationLabel(operation.kind)} outcome is unconfirmed. Retry the same request to reconcile it.`,
    })
  }

  const execute = async (operation: Operation, epoch: number): Promise<void> => {
    let rawResult: AwardResult | ReverseResult

    try {
      rawResult = operation.kind === 'award'
        ? await awardLockedBom(operation.formData)
        : await reverseAwardHandoff(operation.formData)
    } catch {
      markUnknown(operation, epoch)
      return
    }

    if (!isCurrent(operation, epoch)) return

    if (isKnownFailure(rawResult)) {
      operationRef.current = null
      setOperationState(null)
      setNotice({ kind: 'error', message: rawResult.error })
      return
    }

    if (!isActionSuccess(rawResult)) {
      markUnknown(operation, epoch)
      return
    }

    operationRef.current = null
    setOperationState(null)

    let refreshFailed = false
    try {
      await Promise.resolve(router.refresh())
    } catch {
      refreshFailed = true
    }

    if (!mountedRef.current || epochRef.current !== epoch) return

    const label = operationLabel(operation.kind)
    const refreshWarning = getRefreshWarning(rawResult)
    const message = refreshFailed
      ? `${label} committed, but the page could not refresh. Reload to see the latest state.${refreshWarning ? ` ${refreshWarning}` : ''}`
      : refreshWarning
        ? `${label} committed. ${refreshWarning}`
        : `${label} committed. The page refresh was requested.`

    setNotice({ kind: 'success', message })
  }

  const begin = (kind: OperationKind, formData: FormData): void => {
    if (operationRef.current) return

    const operation: Operation = { kind, formData: cloneFormData(formData) }
    const nextState: OperationState = { operation, phase: 'pending' }
    const epoch = epochRef.current + 1
    epochRef.current = epoch
    operationRef.current = nextState
    setOperationState(nextState)
    setNotice(null)
    void execute(operation, epoch)
  }

  const retry = (): void => {
    const current = operationRef.current
    if (!current || current.phase !== 'unknown') return

    const nextState: OperationState = { operation: current.operation, phase: 'pending' }
    const epoch = epochRef.current + 1
    epochRef.current = epoch
    operationRef.current = nextState
    setOperationState(nextState)
    setNotice(null)
    void execute(nextState.operation, epoch)
  }

  const submitAward = (formData: FormData): void => begin('award', formData)
  const submitReverse = (formData: FormData): void => begin('reverse', formData)

  const activeHandoff = handoff?.status === 'active' ? handoff : null
  const isFrozen = operationState !== null
  const isPending = operationState?.phase === 'pending'

  return (
    <section
      aria-labelledby="award-automation-title"
      aria-busy={isPending}
      style={{
        marginTop: 24,
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        background: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="award-automation-title" style={{ margin: 0, fontSize: 15, color: 'var(--color-neutral-900)' }}>
              Award handoff
            </h2>
            <p style={{ margin: '5px 0 0', maxWidth: 680, fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-neutral-500)' }}>
              Promote this locked BOM into one auditable execution handoff. Existing project shells are promoted in place; no duplicate project is created.
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 28,
              padding: '0 10px',
              borderRadius: 999,
              background: activeHandoff ? 'var(--color-success-soft)' : 'var(--color-neutral-100)',
              color: activeHandoff ? 'var(--color-success)' : 'var(--color-neutral-600)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {activeHandoff ? 'Awarded' : handoff?.status === 'reversed' ? 'Reversed' : 'Locked BOM'}
          </span>
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {activeHandoff ? (
          <div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: 0 }}>
              <Metric label="Project code" value={activeHandoff.projectCode} />
              <Metric label="Budget baseline" value={activeHandoff.budgetId} mono />
              <Metric label="DP invoice draft" value={activeHandoff.dpInvoiceId} mono />
              <Metric label="Tracker" value={activeHandoff.projectTrackerId} mono />
            </dl>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 18 }}>
              {taskLabels.map(([key, label]) => (
                <div key={key} style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{label}</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-neutral-800)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' }}>
                    {activeHandoff.taskIds[key] ?? '—'}
                  </div>
                </div>
              ))}
            </div>
            <form action={submitReverse} style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="handoffId" value={activeHandoff.id} />
              <label htmlFor="award-reversal-reason" style={{ flex: '1 1 280px', minWidth: 0, fontSize: 12, color: 'var(--color-neutral-600)' }}>
                Reversal reason
                <input
                  id="award-reversal-reason"
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                  value={reversalReason}
                  onChange={(event) => setReversalReason(event.currentTarget.value)}
                  disabled={isFrozen}
                  style={inputStyle}
                />
              </label>
              <button type="submit" disabled={isFrozen} style={secondaryButtonStyle}>
                {isPending && operationState?.operation.kind === 'reverse' ? 'Reversing…' : 'Reverse handoff'}
              </button>
            </form>
          </div>
        ) : handoff?.status === 'reversed' ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--color-warning)' }}>
            This BOM has a recorded reversal. A new award requires an explicit re-award policy; this UI will not silently create duplicate finance artifacts.
          </p>
        ) : (
          <form action={submitAward} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'end' }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="bomId" value={bomId} />
            <label htmlFor="award-down-payment-percent" style={{ minWidth: 0, fontSize: 12, color: 'var(--color-neutral-600)' }}>
              Down payment %
              <input id="award-down-payment-percent" name="downPaymentPercent" type="number" min="0" max="100" step="0.01" value={downPaymentPercent} onChange={(event) => setDownPaymentPercent(event.currentTarget.value)} inputMode="decimal" disabled={isFrozen} style={inputStyle} />
            </label>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.5, color: 'var(--color-neutral-500)' }}>
                {projectCode ? `Current project code: ${projectCode}.` : 'A project code will be allocated under tenant scope.'} A zero rate creates a clearly labelled draft placeholder; Finance must confirm tax and billing treatment before issue.
              </p>
              <button type="submit" disabled={isFrozen} style={primaryButtonStyle}>
                {isPending && operationState?.operation.kind === 'award' ? 'Creating handoff…' : 'Create award handoff'}
              </button>
            </div>
          </form>
        )}

        <div aria-live="polite" aria-atomic="true">
          {notice ? (
            <div
              role={notice.kind === 'success' ? 'status' : 'alert'}
              style={{ margin: '16px 0 0', fontSize: 12.5, lineHeight: 1.55, color: notice.kind === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}
            >
              <span>{notice.message}</span>
              {notice.kind === 'unknown' ? (
                <button type="button" onClick={retry} disabled={isPending} style={{ ...secondaryButtonStyle, minHeight: 36, marginTop: 10, padding: '0 12px' }}>
                  {operationState?.operation.kind === 'reverse' ? 'Retry reversal' : 'Retry award handoff'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function cloneFormData(formData: FormData): FormData {
  const copy = new FormData()
  for (const [key, value] of formData.entries()) copy.append(key, value)
  return copy
}

function operationLabel(kind: OperationKind): string {
  return kind === 'award' ? 'Award handoff' : 'Award reversal'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isKnownFailure(value: unknown): value is { ok: false; error: string } {
  return isRecord(value) && value.ok === false && typeof value.error === 'string' && value.error.trim().length > 0
}

function isActionSuccess(value: unknown): value is { ok: true; refreshWarning?: unknown } {
  return isRecord(value) && value.ok === true
}

function getRefreshWarning(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.refreshWarning !== 'string') return undefined
  const warning = value.refreshWarning.trim()
  return warning.length > 0 ? warning : undefined
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{label}</dt>
      <dd style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--color-neutral-900)', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined, overflowWrap: 'anywhere' }}>{value}</dd>
    </div>
  )
}

const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 44,
  marginTop: 6,
  padding: '9px 11px',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-background)',
  color: 'var(--color-neutral-900)',
  font: 'inherit',
}

const primaryButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 16px',
  border: 0,
  borderRadius: 8,
  background: 'var(--color-navy-700)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: 'transparent',
  border: '1px solid var(--color-border)',
  color: 'var(--color-neutral-800)',
}
