'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import {
  lockProjectWeeklyProgressCommandSchema,
  projectWeeklyProgressCommandReceiptSchema,
  weeklyProgressLockPayload,
  type LockProjectWeeklyProgressCommand,
  type ProjectWeeklyProgressCommandReceipt,
  type ProjectWeeklyProgressRow,
} from '@third-code-erp/shared-types'
import {
  lockWeeklyProgressCommand,
  type WeeklyCommandScope,
} from '@/app/(dashboard)/projects/[id]/progress/weekly-command-actions'

interface Props {
  projectId: string
  rows: ProjectWeeklyProgressRow[]
  canLock: boolean
  tenantId: string
  actorId: string
  enabled: boolean
  loadError?: string | null
}

type Scope = WeeklyCommandScope
type CommandPhase = 'idle' | 'pending' | 'unknown'
type KeyedLockCommand = LockProjectWeeklyProgressCommand & { clientRequestId: string }

type ActiveCommand = {
  scope: Scope
  periodId: string
  command: KeyedLockCommand
  unknownObserved: boolean
}

const uuidSchema = z.string().guid()
const lockSuccessSchema = z
  .object({
    ok: z.literal(true),
    receipt: projectWeeklyProgressCommandReceiptSchema,
    changed: z.boolean(),
    warning: z.string().max(500).optional(),
  })
  .strict()
const lockFailureSchema = z
  .object({
    ok: z.literal(false),
    outcome: z.enum(['rejected', 'unknown']),
    error: z.string().trim().min(1).max(500),
  })
  .strict()

const LOCK_REASON = 'Thursday WAR cut-off'
const UNKNOWN_LOCK_MESSAGE =
  'WAR lock outcome is unconfirmed. The exact lock command is retained; retry it to recover its receipt.'
const REFRESH_WARNING =
  'The command is confirmed, but the page could not refresh. Refresh to see the latest ledger; do not submit a replacement command.'

function sameUuid(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function sameScope(left: Scope, right: Scope): boolean {
  return sameUuid(left.tenantId, right.tenantId)
    && sameUuid(left.actorId, right.actorId)
    && sameUuid(left.projectId, right.projectId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUnknownResult(value: unknown): boolean {
  return isRecord(value) && value.ok === false && value.outcome === 'unknown'
}

function equalPercentages(
  left: ProjectWeeklyProgressRow['percentByCategory'],
  right: ProjectWeeklyProgressRow['percentByCategory'],
): boolean {
  return left.civil_pct === right.civil_pct
    && left.electrical_pct === right.electrical_pct
    && left.mep_pct === right.mep_pct
    && left.finishes_pct === right.finishes_pct
    && left.overall_pct === right.overall_pct
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const buffer = new Uint8Array(bytes).buffer
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function validateLockReceipt(
  receipt: ProjectWeeklyProgressCommandReceipt,
  command: ActiveCommand,
  payloadHash: string,
): boolean {
  if (receipt.operation !== 'lock') return false
  const row = receipt.row
  const snapshot = row.warSnapshot
  const expectedLockedAt = row.lockedAt ? Date.parse(row.lockedAt) : Number.NaN
  const cutoffAt = Date.parse(row.cutoffAt)
  const snapshotCapturedAt = snapshot ? Date.parse(snapshot.capturedAt) : Number.NaN
  return sameScope(receipt, command.scope)
    && sameUuid(receipt.clientRequestId, command.command.clientRequestId)
    && receipt.payloadHash === payloadHash
    && sameUuid(row.id, command.periodId)
    && sameUuid(row.projectId, command.scope.projectId)
    && receipt.expectedVersion === command.command.expectedVersion
    && row.version === command.command.expectedVersion + 1
    && row.status === 'locked'
    && sameUuid(row.lockedBy ?? '', command.scope.actorId)
    && row.lockReason === command.command.lockReason
    && Number.isFinite(expectedLockedAt)
    && Number.isFinite(cutoffAt)
    && expectedLockedAt >= cutoffAt
    && snapshot !== null
    && snapshot.weekEnding === row.weekEnding
    && snapshot.notes === row.notes
    && snapshot.overallPct === row.percentByCategory.overall_pct
    && equalPercentages(snapshot.percentByCategory, row.percentByCategory)
    && Number.isFinite(snapshotCapturedAt)
    && snapshotCapturedAt === expectedLockedAt
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function dateTimeLabel(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

export function WeeklyWarLedger({
  projectId,
  rows,
  canLock,
  tenantId,
  actorId,
  enabled,
  loadError,
}: Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<CommandPhase>('idle')
  const [activeCommand, setActiveCommand] = useState<ActiveCommand | null>(null)
  const [confirmedRows, setConfirmedRows] = useState<Map<string, ProjectWeeklyProgressRow>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const mountedRef = useRef(false)
  const inFlightRef = useRef(false)
  const activeCommandRef = useRef<ActiveCommand | null>(null)
  const scopeRef = useRef<Scope>({ tenantId, actorId, projectId })
  const lastScopeRef = useRef<Scope>({ tenantId, actorId, projectId })

  scopeRef.current = { tenantId, actorId, projectId }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    const nextScope: Scope = { tenantId, actorId, projectId }
    if (sameScope(lastScopeRef.current, nextScope)) return
    lastScopeRef.current = nextScope
    activeCommandRef.current = null
    inFlightRef.current = false
    setActiveCommand(null)
    setPhase('idle')
    setConfirmedRows(new Map())
    setError(null)
    setSuccess(null)
  }, [actorId, projectId, tenantId])

  function isCurrentCommand(command: ActiveCommand): boolean {
    return mountedRef.current
      && activeCommandRef.current === command
      && sameScope(command.scope, scopeRef.current)
  }

  function releaseCommand(command: ActiveCommand): void {
    if (activeCommandRef.current !== command) return
    activeCommandRef.current = null
    inFlightRef.current = false
    setActiveCommand(null)
    setPhase('idle')
  }

  function markUnknown(command: ActiveCommand): void {
    if (!isCurrentCommand(command)) return
    command.unknownObserved = true
    inFlightRef.current = false
    // Keep the same object in state and the ref. Retry handlers can therefore
    // use the command identity as a single-flight fence.
    setActiveCommand(command)
    setPhase('unknown')
    setError(UNKNOWN_LOCK_MESSAGE)
    setSuccess(null)
  }

  function refreshAfterConfirmedCommand(): boolean {
    try {
      router.refresh()
      return false
    } catch {
      return true
    }
  }

  async function execute(command: ActiveCommand): Promise<void> {
    let result: unknown
    try {
      result = await lockWeeklyProgressCommand(command.scope, command.periodId, command.command)
    } catch {
      markUnknown(command)
      return
    }
    if (!isCurrentCommand(command)) return

    if (isUnknownResult(result)) {
      markUnknown(command)
      return
    }

    const failure = lockFailureSchema.safeParse(result)
    if (failure.success) {
      if (failure.data.outcome === 'unknown' || command.unknownObserved) markUnknown(command)
      else {
        releaseCommand(command)
        setError(failure.data.error)
        setSuccess(null)
      }
      return
    }

    const parsed = lockSuccessSchema.safeParse(result)
    if (!parsed.success) {
      markUnknown(command)
      return
    }

    let payloadHash: string
    try {
      payloadHash = await sha256Hex(weeklyProgressLockPayload(command.scope.projectId, command.periodId, command.command))
    } catch {
      markUnknown(command)
      return
    }
    if (!isCurrentCommand(command)) return
    if (!validateLockReceipt(parsed.data.receipt, command, payloadHash)) {
      markUnknown(command)
      return
    }

    const refreshFailed = refreshAfterConfirmedCommand()
    if (!isCurrentCommand(command)) return
    const receipt = parsed.data.receipt
    const message = parsed.data.changed
      ? `WAR period locked for ${receipt.row.weekEnding}. Receipt verified.`
      : `WAR lock for ${receipt.row.weekEnding} was already recorded. Receipt recovered.`
    const warning = parsed.data.warning ?? (refreshFailed ? REFRESH_WARNING : null)
    releaseCommand(command)
    setConfirmedRows(previous => {
      const next = new Map(previous)
      next.set(receipt.row.id.toLowerCase(), receipt.row)
      return next
    })
    setError(null)
    setSuccess(warning ? `${message} ${warning}` : message)
  }

  function retry(command: ActiveCommand): void {
    if (!mountedRef.current || !enabled || !canLock || inFlightRef.current) return
    if (activeCommandRef.current !== command || !command.unknownObserved || phase !== 'unknown') return
    if (!sameScope(command.scope, scopeRef.current)) return
    inFlightRef.current = true
    setPhase('pending')
    setError(null)
    startTransition(() => {
      void execute(command)
    })
  }

  function beginLock(row: ProjectWeeklyProgressRow): void {
    if (!mountedRef.current || !enabled || !canLock || inFlightRef.current || activeCommandRef.current) return
    if (!sameUuid(row.projectId, projectId)) return
    if (!uuidSchema.safeParse(row.id).success) {
      setError('This WAR period has an invalid identifier. Refresh the ledger before locking it.')
      return
    }
    if (row.status === 'locked') return

    let requestId: string
    try {
      requestId = globalThis.crypto.randomUUID()
    } catch {
      setError('A secure lock identifier could not be created. Refresh the page and try again.')
      return
    }
    const parsed = lockProjectWeeklyProgressCommandSchema.extend({ clientRequestId: uuidSchema }).safeParse({
      clientRequestId: requestId,
      expectedVersion: row.version,
      lockReason: LOCK_REASON,
    })
    if (!parsed.success) {
      setError('This WAR period cannot be locked because its version is invalid. Refresh the ledger.')
      return
    }
    const command: ActiveCommand = {
      scope: { tenantId, actorId, projectId },
      periodId: row.id,
      command: parsed.data,
      unknownObserved: false,
    }
    if (!sameScope(command.scope, scopeRef.current)) return
    activeCommandRef.current = command
    inFlightRef.current = true
    setActiveCommand(command)
    setPhase('pending')
    setError(null)
    setSuccess(null)
    startTransition(() => {
      void execute(command)
    })
  }

  function effectiveRow(row: ProjectWeeklyProgressRow): ProjectWeeklyProgressRow {
    const confirmed = confirmedRows.get(row.id.toLowerCase())
    if (!confirmed) return row
    if (sameUuid(row.projectId, projectId)
      && (row.version > confirmed.version || (row.version === confirmed.version && row.status === 'locked'))) return row
    return confirmed
  }

  const scopedRows = rows.filter(row => sameUuid(row.projectId, projectId)).map(effectiveRow)
  const commandPending = phase === 'pending' || pending
  const retryableCommand = activeCommand?.unknownObserved && phase === 'unknown' ? activeCommand : null

  if (!enabled) return null

  return (
    <section className="card weekly-war-ledger" aria-labelledby="weekly-war-ledger-heading">
      <div className="card-header weekly-war-ledger__header">
        <div>
          <h2 id="weekly-war-ledger-heading" className="card-title">WAR cut-off ledger</h2>
          <p className="cost-section-sub">
            Thursday 17:00 PHT locks the submitted evidence for the weekly work-accomplishment report.
          </p>
        </div>
        <span className="weekly-war-ledger__badge">Core ledger</span>
      </div>

      {loadError && (
        <p className="weekly-war-ledger__error" role="alert" aria-live="assertive">
          {loadError}
        </p>
      )}
      {error && (
        <p className="weekly-war-ledger__error" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          aria-live="polite"
          style={{ margin: 0, padding: '10px 16px', color: '#166534', background: '#f0fdf4', fontSize: '0.75rem' }}
        >
          {success}
        </p>
      )}
      {retryableCommand && (
        <div
          role="status"
          aria-live="polite"
          style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--color-neutral-50)' }}
        >
          <p style={{ margin: 0, fontSize: 12 }}>
            The exact WAR lock command is retained. Retry it to recover the receipt without creating a replacement lock.
          </p>
          {canLock ? (
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={commandPending}
              onClick={() => retry(retryableCommand)}
            >
              Retry same lock
            </button>
          ) : (
            <span className="muted" style={{ flex: '0 0 auto', fontSize: 12 }}>Retry is available when lock permission returns.</span>
          )}
        </div>
      )}

      {scopedRows.length === 0 && !loadError ? (
        <p className="card-empty">
          {activeCommand !== null || confirmedRows.size > 0
            ? 'Weekly evidence is known, but no rows were returned in this view. Refresh to reload the current ledger.'
            : 'No Core weekly periods yet. Submit the first update to open a WAR period.'}
        </p>
      ) : scopedRows.length > 0 ? (
        <div className="weekly-war-ledger__table-wrap" role="region" aria-label="Weekly WAR evidence">
          <table className="data-table">
            <thead>
              <tr>
                <th>Week ending</th>
                <th>Status</th>
                <th className="numeric">Overall</th>
                <th>Cut-off (PHT)</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {scopedRows.map(row => {
                const isLocked = row.status === 'locked'
                const commandForRow = activeCommand && sameUuid(activeCommand.periodId, row.id) ? activeCommand : null
                const retryable = Boolean(commandForRow?.unknownObserved && phase === 'unknown')
                return (
                  <tr key={row.id}>
                    <td>{dateLabel(row.weekEnding)}</td>
                    <td>
                      <span className={`weekly-war-ledger__status weekly-war-ledger__status--${row.status}`}>
                        {isLocked ? 'Locked' : 'Open'}
                      </span>
                    </td>
                    <td className="numeric" style={{ fontWeight: 600 }}>{row.percentByCategory.overall_pct}%</td>
                    <td className="muted">{dateTimeLabel(row.cutoffAt)}</td>
                    <td className="numeric">
                      {canLock && !isLocked && !retryable && (
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={commandPending || activeCommand !== null}
                          onClick={() => beginLock(row)}
                        >
                          {commandForRow && phase === 'pending' ? 'Locking…' : 'Lock WAR'}
                        </button>
                      )}
                      {isLocked && <span className="muted">Immutable evidence</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="card-empty">Weekly evidence could not be loaded. No empty-state conclusion was made.</p>
      )}
    </section>
  )
}
