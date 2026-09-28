'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  recordMobilizationInput,
  startMobilization,
} from '@/app/(dashboard)/projects/[id]/permits/actions'

type InputKey =
  | 'commented_fcd_received_at'
  | 'po_copies_received_at'
  | 'cari_received_at'
  | 'ntp_received_at'

interface MobilizationReadinessPanelProps {
  projectId: string
  canOverride: boolean
  readiness: {
    commentedFcdReceivedAt: string | null
    poCopiesReceivedAt: string | null
    cariReceivedAt: string | null
    ntpReceivedAt: string | null
    startedAt: string | null
    overrideReason: string | null
  } | null
  riskByInput: Record<InputKey, number | null>
}

const INPUTS: Array<{ key: InputKey; label: string; description: string }> = [
  {
    key: 'commented_fcd_received_at',
    label: 'Commented FCD',
    description: 'Commented-for-construction drawing set returned.',
  },
  {
    key: 'po_copies_received_at',
    label: 'PO copies',
    description: 'Issued purchase-order copies available to the site team.',
  },
  {
    key: 'cari_received_at',
    label: 'CARI',
    description: 'Construction-related insurance return received.',
  },
  {
    key: 'ntp_received_at',
    label: 'NTP from Building Admin',
    description: 'Notice to proceed / building-admin release received.',
  },
]

type DatesByInput = Record<InputKey, string>
type Operation =
  | {
      kind: 'record'
      projectId: string
      inputType: InputKey
      receivedAt: string
    }
  | {
      kind: 'start'
      projectId: string
      overrideReason: string
    }
type OperationState = { operation: Operation; phase: 'pending' | 'unknown' }
type Notice = { kind: 'success' | 'error' | 'unknown'; message: string }

function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ''
}

function inputValue(
  readiness: MobilizationReadinessPanelProps['readiness'],
  key: InputKey
): string {
  if (!readiness) return ''
  const values: Record<InputKey, string | null> = {
    commented_fcd_received_at: readiness.commentedFcdReceivedAt,
    po_copies_received_at: readiness.poCopiesReceivedAt,
    cari_received_at: readiness.cariReceivedAt,
    ntp_received_at: readiness.ntpReceivedAt,
  }
  return toDateInput(values[key])
}

function datesFromReadiness(
  readiness: MobilizationReadinessPanelProps['readiness']
): DatesByInput {
  return {
    commented_fcd_received_at: inputValue(readiness, 'commented_fcd_received_at'),
    po_copies_received_at: inputValue(readiness, 'po_copies_received_at'),
    cari_received_at: inputValue(readiness, 'cari_received_at'),
    ntp_received_at: inputValue(readiness, 'ntp_received_at'),
  }
}

function normalizeDateOnly(value: string): string | null {
  const dateOnly = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null
  const day = new Date(`${dateOnly}T00:00:00.000Z`)
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== dateOnly) return null
  return dateOnly
}

function parseReceiptDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() !== value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) return null
  return normalizeDateOnly(value)
}

function parseCanonicalTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() !== value) return null
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value ? value : null
}

function riskLabel(daysAtRisk: number | null, savedValue: string): string {
  if (savedValue) return 'Received'
  if (daysAtRisk === null) return 'No forecast'
  if (daysAtRisk > 0) return `${daysAtRisk}d overdue`
  return '0d at risk'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isKnownFailure(value: unknown): value is { error: string; unconfirmed?: boolean } {
  return isRecord(value) && typeof value.error === 'string' && value.error.trim().length > 0
}

function isUnconfirmedFailure(value: unknown): value is { error: string; unconfirmed: true } {
  return isKnownFailure(value) && value.unconfirmed === true
}

function getRefreshWarning(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.refreshWarning !== 'string') return undefined
  const warning = value.refreshWarning.trim()
  return warning.length > 0 ? warning : undefined
}

function getRecordSuccess(
  value: unknown,
  operation: Extract<Operation, { kind: 'record' }>
): { receivedAt: string; refreshWarning?: string } | null {
  if (!isRecord(value) || value.projectId !== operation.projectId || value.inputType !== operation.inputType) {
    return null
  }
  const receivedAt = parseReceiptDate(value.receivedAt)
  if (!receivedAt || receivedAt !== operation.receivedAt) return null
  return { receivedAt, refreshWarning: getRefreshWarning(value) }
}

function getStartSuccess(
  value: unknown,
  projectId: string
): { startedAt: string; refreshWarning?: string } | null {
  const startedAt = isRecord(value) ? parseCanonicalTimestamp(value.startedAt) : null
  if (!isRecord(value) || value.projectId !== projectId || !startedAt) {
    return null
  }
  return { startedAt, refreshWarning: getRefreshWarning(value) }
}

function operationLabel(operation: Operation): string {
  if (operation.kind === 'start') return 'Mobilization start'
  const input = INPUTS.find(({ key }) => key === operation.inputType)
  return `${input?.label ?? 'Mobilization'} receipt`
}

function retryLabel(operation: Operation): string {
  return operation.kind === 'record'
    ? `Retry ${operationLabel(operation)}`
    : 'Retry mobilization start'
}

export function MobilizationReadinessPanel(props: MobilizationReadinessPanelProps) {
  // Project identity is the state boundary. A late response from another
  // project must never update this panel or request a refresh for this scope.
  return <MobilizationReadinessPanelContent key={props.projectId} {...props} />
}

function MobilizationReadinessPanelContent({
  projectId,
  canOverride,
  readiness,
  riskByInput,
}: MobilizationReadinessPanelProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const initialDates = datesFromReadiness(readiness)
  const [dates, setDates] = useState<DatesByInput>(initialDates)
  const [savedDates, setSavedDates] = useState<DatesByInput>(initialDates)
  const [startedAt, setStartedAt] = useState(readiness?.startedAt ?? null)
  const [overrideReason, setOverrideReason] = useState(readiness?.overrideReason ?? '')
  const [operationState, setOperationState] = useState<OperationState | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const operationRef = useRef<OperationState | null>(null)
  const epochRef = useRef(0)
  const mountedRef = useRef(true)
  const savedDatesRef = useRef(savedDates)
  const serverDatesRef = useRef(initialDates)
  const startedAtRef = useRef(startedAt)

  savedDatesRef.current = savedDates
  startedAtRef.current = startedAt

  useEffect(() => {
    const incomingDates = datesFromReadiness(readiness)
    const previousDates = serverDatesRef.current
    serverDatesRef.current = incomingDates

    const changedInputs = INPUTS.filter(({ key }) => incomingDates[key] !== previousDates[key])
    if (changedInputs.length > 0) {
      setSavedDates((current) => {
        let next: DatesByInput | null = null
        for (const { key } of changedInputs) {
          if (current[key] === incomingDates[key]) continue
          next ??= { ...current }
          next[key] = incomingDates[key]
        }
        return next ?? current
      })
      setDates((current) => {
        let next: DatesByInput | null = null
        for (const { key } of changedInputs) {
          // Keep a locally edited value visible while accepting the new saved
          // value above. A clean field follows the server response.
          if (current[key] !== savedDatesRef.current[key]) continue
          if (current[key] === incomingDates[key]) continue
          next ??= { ...current }
          next[key] = incomingDates[key]
        }
        return next ?? current
      })
    }

    const incomingStartedAt = readiness?.startedAt ?? null
    if (incomingStartedAt && !startedAtRef.current) {
      startedAtRef.current = incomingStartedAt
      setStartedAt(incomingStartedAt)
    }
  }, [
    readiness?.commentedFcdReceivedAt,
    readiness?.poCopiesReceivedAt,
    readiness?.cariReceivedAt,
    readiness?.ntpReceivedAt,
    readiness?.startedAt,
    readiness,
  ])

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

  const markUnknown = (operation: Operation, epoch: number): void => {
    if (!isCurrent(operation, epoch)) return
    const nextState: OperationState = { operation, phase: 'unknown' }
    operationRef.current = nextState
    setOperationState(nextState)
    setNotice({
      kind: 'unknown',
      message: `${operationLabel(operation)} outcome is unconfirmed. Retry the same request to reconcile it.`,
    })
  }

  const finishSuccess = async (
    operation: Operation,
    epoch: number,
    result: { refreshWarning?: string }
  ): Promise<void> => {
    operationRef.current = null
    setOperationState(null)

    let refreshFailed = false
    try {
      await Promise.resolve(router.refresh())
    } catch {
      refreshFailed = true
    }

    if (!mountedRef.current || epochRef.current !== epoch) return

    const label = operationLabel(operation)
    const refreshWarning = result.refreshWarning
    const message = refreshFailed
      ? `${label} committed, but the page could not refresh. Reload to see the recorded result.${refreshWarning ? ` ${refreshWarning}` : ''}`
      : refreshWarning
        ? `${label} committed. ${refreshWarning}`
        : `${label} committed. The page refresh was requested.`
    setNotice({ kind: 'success', message })
  }

  const execute = async (operation: Operation, epoch: number): Promise<void> => {
    let rawResult: unknown
    try {
      rawResult = operation.kind === 'record'
        ? await recordMobilizationInput(operation.projectId, operation.inputType, operation.receivedAt)
        : await startMobilization(operation.projectId, operation.overrideReason)
    } catch {
      markUnknown(operation, epoch)
      return
    }

    if (!isCurrent(operation, epoch)) return

    if (isUnconfirmedFailure(rawResult)) {
      markUnknown(operation, epoch)
      return
    }

    if (isKnownFailure(rawResult)) {
      operationRef.current = null
      setOperationState(null)
      setNotice({ kind: 'error', message: rawResult.error })
      return
    }

    if (operation.kind === 'record') {
      const result = getRecordSuccess(rawResult, operation)
      if (!result) {
        markUnknown(operation, epoch)
        return
      }
      // This is the only path that advances the saved receipt count. An
      // edited input remains merely controlled state until this exact scoped
      // server envelope is validated.
      setSavedDates((current) => ({ ...current, [operation.inputType]: result.receivedAt }))
      setDates((current) => ({ ...current, [operation.inputType]: result.receivedAt }))
      await finishSuccess(operation, epoch, result)
      return
    }

    const result = getStartSuccess(rawResult, operation.projectId)
    if (!result) {
      markUnknown(operation, epoch)
      return
    }
    startedAtRef.current = result.startedAt
    setStartedAt(result.startedAt)
    await finishSuccess(operation, epoch, result)
  }

  const begin = (operation: Operation): void => {
    if (operationRef.current) return
    const nextState: OperationState = { operation, phase: 'pending' }
    const epoch = epochRef.current + 1
    epochRef.current = epoch
    operationRef.current = nextState
    setOperationState(nextState)
    setNotice(null)
    startTransition(() => {
      void execute(operation, epoch)
    })
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
    startTransition(() => {
      void execute(nextState.operation, epoch)
    })
  }

  const saveInput = (key: InputKey): void => {
    const receivedAt = dates[key]
    if (!receivedAt) return
    begin({ kind: 'record', projectId, inputType: key, receivedAt })
  }

  const handleStart = (): void => {
    if (!canOverride && !complete) return
    if (!savedDates.commented_fcd_received_at || !savedDates.po_copies_received_at || !savedDates.cari_received_at || !savedDates.ntp_received_at) {
      if (!overrideReason.trim()) return
    }
    begin({ kind: 'start', projectId, overrideReason: complete ? '' : overrideReason })
  }

  const receivedCount = INPUTS.filter(({ key }) => Boolean(savedDates[key])).length
  const complete = receivedCount === INPUTS.length
  const started = Boolean(startedAt)
  const isFrozen = operationState !== null
  const isPending = operationState?.phase === 'pending'

  return (
    <section
      aria-labelledby="mobilization-readiness-heading"
      aria-busy={isPending}
      style={{
        background: 'var(--color-navy-950, #071827)',
        borderRadius: '10px',
        color: 'white',
        marginBottom: '16px',
        padding: '20px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', fontSize: '0.72rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Mobilization gate
          </p>
          <h2 id="mobilization-readiness-heading" style={{ margin: '5px 0 4px', fontSize: '1.1rem' }}>
            Four returns before site start
          </h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.72)', fontSize: '0.82rem', maxWidth: '620px' }}>
            Record the evidence date for every return. The saved count advances only after the server confirms the receipt; unsaved edits remain pending until saved.
          </p>
        </div>
        <div
          aria-live="polite"
          style={{
            border: '1px solid rgba(255,255,255,.18)',
            borderRadius: '999px',
            color: complete || started ? '#b9f6d0' : '#fde68a',
            fontSize: '0.76rem',
            padding: '7px 11px',
            whiteSpace: 'nowrap',
          }}
        >
          {started ? 'Started' : `${receivedCount}/4 returns received`}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: '18px' }}>
        {INPUTS.map(({ key, label, description }) => {
          const value = dates[key]
          const savedValue = savedDates[key]
          const risk = riskByInput[key]
          const isEdited = value !== savedValue
          const isSaving = isPending && operationState?.operation.kind === 'record' && operationState.operation.inputType === key
          return (
            <div key={key} style={{ border: '1px solid rgba(255,255,255,.13)', borderRadius: '8px', padding: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
                <strong style={{ fontSize: '0.87rem' }}>{label}</strong>
                <span style={{ color: savedValue ? '#b9f6d0' : risk !== null && risk > 0 ? '#fca5a5' : 'rgba(255,255,255,.58)', fontSize: '0.68rem' }}>
                  {riskLabel(risk, savedValue)}
                </span>
              </div>
              <p style={{ color: 'rgba(255,255,255,.58)', fontSize: '0.74rem', lineHeight: 1.45, margin: '5px 0 10px', minHeight: '32px' }}>
                {description}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '7px' }}>
                <span style={{ color: savedValue ? '#b9f6d0' : 'rgba(255,255,255,.58)', fontSize: '0.68rem', fontWeight: 700 }}>
                  {savedValue ? 'Saved' : 'Not recorded'}
                </span>
                {isEdited ? (
                  <span style={{ color: '#fde68a', fontSize: '0.68rem' }}>Unsaved edit</span>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: '7px' }}>
                <input
                  aria-label={`${label} received date`}
                  type="date"
                  value={value}
                  disabled={isFrozen || started}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value
                    setDates((current) => ({ ...current, [key]: nextValue }))
                  }}
                  style={{ background: 'var(--color-surface)', border: 0, borderRadius: '5px', color: '#102538', minHeight: '44px', minWidth: 0, padding: '7px 8px', width: '100%' }}
                />
                <button
                  type="button"
                  aria-label={`${isSaving ? 'Saving' : 'Save'} ${label} receipt`}
                  disabled={isFrozen || started || !value}
                  onClick={() => saveInput(key)}
                  style={{ background: value ? '#d8f6e4' : 'rgba(255,255,255,.12)', border: 0, borderRadius: '5px', color: '#102538', cursor: isFrozen || started || !value ? 'not-allowed' : 'pointer', fontSize: '0.74rem', fontWeight: 700, minHeight: '44px', padding: '0 10px', whiteSpace: 'nowrap' }}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {!complete && !started && canOverride && (
        <label style={{ display: 'block', marginTop: '16px' }}>
          <span style={{ color: 'rgba(255,255,255,.78)', display: 'block', fontSize: '0.77rem', fontWeight: 600, marginBottom: '5px' }}>
            Override reason (required if any return is missing)
          </span>
          <textarea
            aria-label="Mobilization override reason"
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.currentTarget.value)}
            disabled={isFrozen}
            rows={2}
            placeholder="Name the missing return, risk owner, and mitigation."
            style={{ border: '1px solid rgba(255,255,255,.2)', borderRadius: '5px', boxSizing: 'border-box', fontFamily: 'inherit', minHeight: '64px', padding: '8px', resize: 'vertical', width: '100%' }}
          />
        </label>
      )}

      {!complete && !started && !canOverride ? (
        <p style={{ color: 'rgba(255,255,255,.72)', fontSize: '0.8rem', lineHeight: 1.5, margin: '16px 0 0' }}>
          Awaiting all four returns before mobilization can start. Your role cannot authorize an override.
        </p>
      ) : null}

      <div aria-live="polite" aria-atomic="true">
        {notice ? (
          <div
            role={notice.kind === 'success' ? 'status' : 'alert'}
            style={{ color: notice.kind === 'success' ? '#b9f6d0' : notice.kind === 'unknown' ? '#fde68a' : '#fecaca', fontSize: '0.8rem', lineHeight: 1.55, margin: '13px 0 0' }}
          >
            <span>{notice.message}</span>
            {notice.kind === 'unknown' ? (
              <button type="button" onClick={retry} disabled={isPending} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.28)', borderRadius: '6px', color: 'white', cursor: isPending ? 'not-allowed' : 'pointer', display: 'block', fontWeight: 700, minHeight: '44px', marginTop: '10px', padding: '0 12px' }}>
                {retryLabel(operationState?.operation ?? { kind: 'start', projectId, overrideReason: '' })}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        {started || complete || canOverride ? (
          <button
            type="button"
            disabled={isFrozen || started || (!complete && !overrideReason.trim())}
            onClick={handleStart}
            style={{ background: complete || overrideReason.trim() ? '#d8f6e4' : 'rgba(255,255,255,.12)', border: 0, borderRadius: '6px', color: '#102538', cursor: isFrozen || started || (!complete && !overrideReason.trim()) ? 'not-allowed' : 'pointer', fontWeight: 700, minHeight: '44px', padding: '9px 14px' }}
          >
            {started ? 'Mobilization started' : isPending && operationState?.operation.kind === 'start' ? 'Starting…' : complete ? 'Mark mobilization started' : 'Start with authorized override'}
          </button>
        ) : null}
      </div>
    </section>
  )
}
