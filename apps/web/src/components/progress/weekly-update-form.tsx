'use client'

/**
 * Weekly progress capture surface.
 *
 * Core writes are command/receipt based: the exact command remains available
 * after an uncertain result so a retry cannot accidentally create a second
 * weekly update. The legacy path is retained for workspaces outside the Core
 * canary and only treats a response with a durable id as a success.
 */

import React, {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import {
  createProjectWeeklyProgressCommandSchema,
  projectWeeklyProgressCommandReceiptSchema,
  weeklyProgressCapturePayload,
  type CreateProjectWeeklyProgressCommand,
  type ProjectWeeklyProgressCommandReceipt,
  type ProjectWeeklyProgressPercent,
} from '@third-code-erp/shared-types'
import { submitWeeklyProgress } from '@/app/(dashboard)/projects/[id]/progress/actions'
import {
  captureWeeklyProgressCommand,
  type WeeklyCommandScope,
} from '@/app/(dashboard)/projects/[id]/progress/weekly-command-actions'

interface Props {
  projectId: string
  defaultWeekEnding?: string
  tenantId: string
  actorId: string
  canSubmit: boolean
  coreWritesEnabled: boolean
}

type Field = keyof ProjectWeeklyProgressPercent
type Scope = WeeklyCommandScope
type CommandPhase = 'idle' | 'pending' | 'unknown'

type CoreCommand = {
  kind: 'core'
  scope: Scope
  command: CreateProjectWeeklyProgressCommand
  unknownObserved: boolean
}

type LegacyCommand = {
  kind: 'legacy'
  scope: Scope
  weekEnding: string
  values: ProjectWeeklyProgressPercent
  unknownObserved: false
}

type ActiveCommand = CoreCommand | LegacyCommand

const rows: Array<{ label: string; field: Field }> = [
  { label: 'Civil', field: 'civil_pct' },
  { label: 'Electrical', field: 'electrical_pct' },
  { label: 'MEP', field: 'mep_pct' },
  { label: 'Finishes', field: 'finishes_pct' },
  { label: 'Overall', field: 'overall_pct' },
]

const uuidSchema = z.string().uuid()
const captureSuccessSchema = z
  .object({
    ok: z.literal(true),
    receipt: projectWeeklyProgressCommandReceiptSchema,
    changed: z.boolean(),
    warning: z.string().max(500).optional(),
  })
  .strict()
const captureFailureSchema = z
  .object({
    ok: z.literal(false),
    outcome: z.enum(['rejected', 'unknown']),
    error: z.string().trim().min(1).max(500),
  })
  .strict()

const UNKNOWN_CAPTURE_MESSAGE =
  'Weekly progress capture outcome is unconfirmed. The exact command is retained; retry it to recover its receipt.'
const REFRESH_WARNING =
  'The command is confirmed, but the page could not refresh. Refresh to see the latest history; do not submit a replacement command.'

function initialValues(): ProjectWeeklyProgressPercent {
  return {
    civil_pct: 0,
    electrical_pct: 0,
    mep_pct: 0,
    finishes_pct: 0,
    overall_pct: 0,
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function defaultSunday(): string {
  const today = new Date()
  const day = today.getDay()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() + (day === 0 ? 0 : 7 - day))
  return toIsoDate(sunday)
}

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
  left: ProjectWeeklyProgressPercent,
  right: ProjectWeeklyProgressPercent,
): boolean {
  return left.civil_pct === right.civil_pct
    && left.electrical_pct === right.electrical_pct
    && left.mep_pct === right.mep_pct
    && left.finishes_pct === right.finishes_pct
    && left.overall_pct === right.overall_pct
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  // Copy into a plain ArrayBuffer. TypeScript's DOM definitions model the
  // TextEncoder view as ArrayBufferLike, while SubtleCrypto accepts a stable
  // ArrayBuffer in every supported browser.
  const buffer = new Uint8Array(bytes).buffer
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function validateCaptureReceipt(
  receipt: ProjectWeeklyProgressCommandReceipt,
  command: CoreCommand,
  payloadHash: string,
): boolean {
  const input = command.command
  const row = receipt.row
  return receipt.operation === 'capture'
    && sameScope(receipt, command.scope)
    && sameUuid(receipt.clientRequestId, input.clientRequestId)
    && receipt.payloadHash === payloadHash
    && sameUuid(row.projectId, command.scope.projectId)
    && sameUuid(row.clientRequestId, input.clientRequestId)
    && row.weekEnding === input.weekEnding
    && equalPercentages(row.percentByCategory, input.percentByCategory)
    && row.notes === input.notes
    && row.status === 'open'
    && row.warSnapshot === null
    && row.lockedAt === null
    && row.lockedBy === null
    && row.lockReason === ''
}

function warningMessage(actionWarning: string | undefined, refreshFailed: boolean): string | null {
  if (actionWarning && refreshFailed) return `${actionWarning} ${REFRESH_WARNING}`
  if (actionWarning) return actionWarning
  if (refreshFailed) return REFRESH_WARNING
  return null
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  padding: '6px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'white',
}

export function WeeklyUpdateForm({
  projectId,
  defaultWeekEnding,
  tenantId,
  actorId,
  canSubmit,
  coreWritesEnabled,
}: Props) {
  const router = useRouter()
  const [weekEnding, setWeekEnding] = useState(defaultWeekEnding ?? defaultSunday())
  const [values, setValues] = useState<ProjectWeeklyProgressPercent>(initialValues)
  const [overallTouched, setOverallTouched] = useState(false)
  const [phase, setPhase] = useState<CommandPhase>('idle')
  const [activeCommand, setActiveCommand] = useState<ActiveCommand | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const mountedRef = useRef(false)
  const inFlightRef = useRef(false)
  const activeCommandRef = useRef<ActiveCommand | null>(null)
  const scopeRef = useRef<Scope>({ tenantId, actorId, projectId })
  const lastScopeRef = useRef<Scope>({ tenantId, actorId, projectId })
  const defaultWeekEndingRef = useRef(defaultWeekEnding)

  scopeRef.current = { tenantId, actorId, projectId }
  defaultWeekEndingRef.current = defaultWeekEnding

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
    setError(null)
    setSuccess(null)
    setWeekEnding(defaultWeekEndingRef.current ?? defaultSunday())
    setValues(initialValues())
    setOverallTouched(false)
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

  function markUnknown(command: CoreCommand): void {
    if (!isCurrentCommand(command)) return
    command.unknownObserved = true
    inFlightRef.current = false
    // Keep the same object in state and the ref. Retry handlers can therefore
    // use the command identity as a single-flight fence.
    setActiveCommand(command)
    setPhase('unknown')
    setError(UNKNOWN_CAPTURE_MESSAGE)
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

  async function executeCore(command: CoreCommand): Promise<void> {
    let result: unknown
    try {
      result = await captureWeeklyProgressCommand(command.scope, command.command)
    } catch {
      markUnknown(command)
      return
    }
    if (!isCurrentCommand(command)) return

    if (isUnknownResult(result)) {
      markUnknown(command)
      return
    }

    const failure = captureFailureSchema.safeParse(result)
    if (failure.success) {
      if (failure.data.outcome === 'unknown' || command.unknownObserved) markUnknown(command)
      else {
        releaseCommand(command)
        setError(failure.data.error)
        setSuccess(null)
      }
      return
    }

    const parsed = captureSuccessSchema.safeParse(result)
    if (!parsed.success) {
      markUnknown(command)
      return
    }

    let payloadHash: string
    try {
      payloadHash = await sha256Hex(weeklyProgressCapturePayload(command.command))
    } catch {
      markUnknown(command)
      return
    }
    if (!isCurrentCommand(command)) return
    if (!validateCaptureReceipt(parsed.data.receipt, command, payloadHash)) {
      markUnknown(command)
      return
    }

    const refreshFailed = refreshAfterConfirmedCommand()
    if (!isCurrentCommand(command)) return
    const receipt = parsed.data.receipt
    const message = parsed.data.changed
      ? `Weekly progress captured for ${receipt.row.weekEnding}. Receipt verified.`
      : `Weekly progress for ${receipt.row.weekEnding} was already captured. Receipt recovered.`
    const warning = warningMessage(parsed.data.warning, refreshFailed)
    releaseCommand(command)
    setError(null)
    setSuccess(warning ? `${message} ${warning}` : message)
  }

  async function executeLegacy(command: LegacyCommand): Promise<void> {
    let result: unknown
    try {
      result = await submitWeeklyProgress(command.scope.projectId, command.weekEnding, command.values)
    } catch {
      if (!isCurrentCommand(command)) return
      releaseCommand(command)
      setError('The legacy weekly update outcome could not be confirmed. Check history before submitting a replacement.')
      setSuccess(null)
      return
    }
    if (!isCurrentCommand(command)) return
    if (!isRecord(result)) {
      releaseCommand(command)
      setError('The legacy weekly update did not return a durable receipt. Refresh before retrying.')
      setSuccess(null)
      return
    }
    if (typeof result.error === 'string' && result.error.trim().length > 0) {
      releaseCommand(command)
      setError(result.error.trim().slice(0, 500))
      setSuccess(null)
      return
    }
    if (typeof result.id !== 'string' || !uuidSchema.safeParse(result.id).success) {
      releaseCommand(command)
      setError('The legacy weekly update did not return a durable receipt. Refresh before retrying.')
      setSuccess(null)
      return
    }
    const refreshFailed = refreshAfterConfirmedCommand()
    if (!isCurrentCommand(command)) return
    releaseCommand(command)
    setError(null)
    setSuccess(
      refreshFailed
        ? `Weekly update submitted through the legacy progress path. ${REFRESH_WARNING}`
        : 'Weekly update submitted through the legacy progress path.',
    )
  }

  function beginCommand(command: ActiveCommand): void {
    if (!mountedRef.current || !canSubmit || inFlightRef.current || activeCommandRef.current) return
    if (!sameScope(command.scope, scopeRef.current)) return
    activeCommandRef.current = command
    inFlightRef.current = true
    setActiveCommand(command)
    setPhase('pending')
    setError(null)
    setSuccess(null)
    startTransition(() => {
      void (command.kind === 'core' ? executeCore(command) : executeLegacy(command))
    })
  }

  function retryCore(command: CoreCommand): void {
    if (!mountedRef.current || !canSubmit || inFlightRef.current) return
    if (activeCommandRef.current !== command || !command.unknownObserved || phase !== 'unknown') return
    if (!sameScope(command.scope, scopeRef.current)) return
    inFlightRef.current = true
    setPhase('pending')
    setError(null)
    startTransition(() => {
      void executeCore(command)
    })
  }

  function setField(field: Field, raw: string): void {
    if (phase !== 'idle' || pending) return
    const number = Number(raw)
    const value = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0
    setValues(previous => {
      const next = { ...previous, [field]: value }
      if (field !== 'overall_pct' && !overallTouched) {
        next.overall_pct = Math.round(
          ((next.civil_pct + next.electrical_pct + next.mep_pct + next.finishes_pct) / 4) * 10,
        ) / 10
      }
      return next
    })
    if (field === 'overall_pct') setOverallTouched(true)
    setError(null)
    setSuccess(null)
  }

  function handleWeekEnding(value: string): void {
    if (phase !== 'idle' || pending) return
    setWeekEnding(value)
    setError(null)
    setSuccess(null)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!mountedRef.current || !canSubmit || inFlightRef.current) return

    const existing = activeCommandRef.current
    if (existing?.kind === 'core' && existing.unknownObserved) {
      // Unknown commands have an explicit retry affordance below. A form
      // submit (including requestSubmit()) must not create an implicit retry.
      return
    }
    if (existing || phase !== 'idle') return

    setError(null)
    setSuccess(null)
    const scope: Scope = { tenantId, actorId, projectId }
    if (coreWritesEnabled) {
      let requestId: string
      try {
        requestId = globalThis.crypto.randomUUID()
      } catch {
        setError('A secure weekly command identifier could not be created. Refresh the page and try again.')
        return
      }
      const command = createProjectWeeklyProgressCommandSchema.safeParse({
        projectId,
        clientRequestId: requestId,
        weekEnding,
        percentByCategory: values,
        notes: '',
      })
      if (!command.success) {
        setError('Check the week and percentage values before submitting.')
        return
      }
      beginCommand({ kind: 'core', scope, command: command.data, unknownObserved: false })
      return
    }

    beginCommand({ kind: 'legacy', scope, weekEnding, values: { ...values }, unknownObserved: false })
  }

  if (!canSubmit) return null

  const controlsLocked = phase !== 'idle' || pending
  const submitDisabled = phase === 'pending' || pending
  const unknownCoreCommand = activeCommand?.kind === 'core' && activeCommand.unknownObserved

  return (
    <form
      className="card"
      onSubmit={onSubmit}
      aria-busy={submitDisabled}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}
    >
      <div className="card-header" style={{ margin: '-16px -16px 0', padding: '14px 16px' }}>
        <div>
          <h2 className="card-title">Submit weekly update</h2>
          <p className="cost-section-sub" style={{ marginBottom: 0 }}>
            Record the latest work-accomplishment percentages for this project.
          </p>
        </div>
      </div>

      {coreWritesEnabled ? (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Core capture uses a durable receipt, so an uncertain submission can be retried unchanged.
        </p>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          This workspace is using the legacy progress path; a durable update id is required before success is shown.
        </p>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>Week ending</span>
        <input
          type="date"
          required
          value={weekEnding}
          disabled={controlsLocked}
          onChange={event => handleWeekEnding(event.target.value)}
          style={inputStyle}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {rows.map(row => (
          <label key={row.field} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span
              style={{
                fontSize: 12,
                color: row.field === 'overall_pct' ? 'var(--color-navy-700)' : 'var(--color-neutral-600)',
                fontWeight: row.field === 'overall_pct' ? 600 : 400,
              }}
            >
              {row.label} %
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              inputMode="decimal"
              value={values[row.field]}
              disabled={controlsLocked}
              onChange={event => setField(row.field, event.target.value)}
              style={inputStyle}
            />
          </label>
        ))}
      </div>

      {unknownCoreCommand && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            The original week and percentages are frozen. Retry keeps the same command identity so it can recover an existing receipt.
          </p>
          <button
            type="button"
            className="button button-secondary"
            disabled={submitDisabled}
            onClick={() => {
              const command = activeCommandRef.current
              if (command?.kind === 'core') retryCore(command)
            }}
          >
            Retry same weekly update
          </button>
        </>
      )}
      {error && <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: 12 }} role="alert" aria-live="assertive">{error}</p>}
      {success && <p style={{ margin: 0, color: 'var(--color-success)', fontSize: 12 }} role="status" aria-live="polite">{success}</p>}

      <button
        type="submit"
        className="button button-primary"
        disabled={controlsLocked}
        style={{ cursor: controlsLocked ? 'wait' : 'pointer' }}
      >
        {phase === 'pending' || pending ? 'Submitting…' : unknownCoreCommand ? 'Awaiting confirmation' : 'Submit weekly progress'}
      </button>
    </form>
  )
}
