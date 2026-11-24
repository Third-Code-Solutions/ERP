'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { deleteCostEntry } from '@/app/(dashboard)/projects/[id]/cost/actions'

export interface CostRow {
  id: string
  description: string
  cost_category: string
  cost_source: string
  reference_number: string | null
  amount_cents: number
  incurred_at: string
}

const CATEGORY_LABEL: Record<string, string> = {
  material: 'Material',
  labour: 'Labour',
  subcontractor: 'Subcontractor',
  equipment: 'Equipment',
  overhead: 'Overhead',
  other: 'Other',
}

const uuidSchema = z.string().guid()
const requestIdSchema = z.string().min(1).max(256)
const manualCostReceiptSchema = z
  .object({
    tenantId: uuidSchema,
    projectId: uuidSchema,
    actorId: uuidSchema,
    requestId: requestIdSchema,
    costEntryId: uuidSchema,
  })
  .strict()
const deleteSuccessSchema = z.object({
  ok: z.literal(true),
  receipt: manualCostReceiptSchema,
  refreshWarning: z.string().max(500).optional(),
})

const UNCONFIRMED_DELETE_MESSAGE =
  'Cost entry void outcome is unconfirmed. The exact request is retained; retry it to reconcile the saved result.'

type DeleteCostEntryAction = (
  entryId: string,
  projectId: string,
  reason: string,
  idempotencyKey: string,
  scope: { tenantId: string; actorId: string },
) => Promise<unknown>

// Keep the captured scope explicit at the UI/action boundary.
const deleteCostEntryAction: DeleteCostEntryAction = (
  entryId,
  projectId,
  reason,
  idempotencyKey,
  scope,
) => deleteCostEntry(entryId, projectId, reason, idempotencyKey, scope)

type VoidCommand = {
  entryId: string
  projectId: string
  tenantId: string
  actorId: string
  reason: string
  requestId: string
  unknownObserved: boolean
}

type CommandPhase = 'idle' | 'pending' | 'unknown'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sameUuid(left: string, right: string): boolean {
  const parsedLeft = uuidSchema.safeParse(left)
  const parsedRight = uuidSchema.safeParse(right)
  return (
    parsedLeft.success &&
    parsedRight.success &&
    parsedLeft.data.toLowerCase() === parsedRight.data.toLowerCase()
  )
}

function actionError(result: unknown): string | null {
  if (!isRecord(result) || typeof result.error !== 'string') return null
  const message = result.error.trim()
  return message.length > 0 ? message.slice(0, 500) : 'Could not void the cost entry.'
}

function isOutcomeUnknown(result: unknown): boolean {
  return isRecord(result) && result.outcomeUnknown === true
}

function validateDeleteReceipt(
  result: unknown,
  command: Pick<
    VoidCommand,
    'entryId' | 'projectId' | 'tenantId' | 'actorId' | 'requestId'
  >,
): z.infer<typeof deleteSuccessSchema> | null {
  const parsed = deleteSuccessSchema.safeParse(result)
  if (!parsed.success) return null
  const { receipt } = parsed.data
  if (
    !sameUuid(receipt.tenantId, command.tenantId) ||
    !sameUuid(receipt.projectId, command.projectId) ||
    !sameUuid(receipt.actorId, command.actorId) ||
    receipt.requestId !== command.requestId ||
    !sameUuid(receipt.costEntryId, command.entryId)
  ) {
    return null
  }
  return parsed.data
}

function withRefreshOutcome(
  message: string,
  refreshWarning: string | undefined,
  refreshFailed: boolean,
): string {
  const additions = [
    refreshWarning ? `Refresh warning: ${refreshWarning}` : null,
    refreshFailed
      ? 'The cost entry void committed, but the page could not refresh. Reload to view the latest log.'
      : null,
  ].filter((value): value is string => value !== null)
  return additions.length > 0 ? `${message} ${additions.join(' ')}` : message
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'po_derived':
      return 'PO'
    case 'import':
      return 'Import'
    case 'manual':
      return 'Manual'
    default:
      return source
  }
}

function php(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function CostTable({
  entries,
  projectId,
  tenantId,
  actorId,
  canRecord,
}: {
  entries: CostRow[]
  projectId: string
  tenantId: string
  actorId: string
  canRecord: boolean
}) {
  const router = useRouter()
  const [commandPhase, setCommandPhase] = useState<CommandPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [voidedIds, setVoidedIds] = useState<ReadonlySet<string>>(new Set())
  const [, startTransition] = useTransition()
  const mountedRef = useRef(false)
  const inFlightRef = useRef(false)
  const scopeRef = useRef({ projectId, tenantId, actorId })
  const commandRef = useRef<VoidCommand | null>(null)
  const commandBusy = commandPhase !== 'idle'

  scopeRef.current = { projectId, tenantId, actorId }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const command = commandRef.current
    if (
      command &&
      (!sameUuid(command.projectId, projectId) ||
        !sameUuid(command.tenantId, tenantId) ||
        !sameUuid(command.actorId, actorId))
    ) {
      commandRef.current = null
      inFlightRef.current = false
      setCommandPhase('idle')
      setError(null)
      setNotice(null)
    }
  }, [actorId, projectId, tenantId])

  function isCurrentCommand(command: VoidCommand): boolean {
    const scope = scopeRef.current
    return (
      mountedRef.current &&
      commandRef.current === command &&
      sameUuid(command.projectId, scope.projectId) &&
      sameUuid(command.tenantId, scope.tenantId) &&
      sameUuid(command.actorId, scope.actorId)
    )
  }

  function isCurrentScope(command: Pick<VoidCommand, 'projectId' | 'tenantId' | 'actorId'>) {
    return (
      sameUuid(command.projectId, projectId) &&
      sameUuid(command.tenantId, tenantId) &&
      sameUuid(command.actorId, actorId)
    )
  }

  function markUnknown(command: VoidCommand) {
    if (!isCurrentCommand(command)) return
    command.unknownObserved = true
    inFlightRef.current = false
    setCommandPhase('unknown')
    setNotice(null)
    setError(UNCONFIRMED_DELETE_MESSAGE)
  }

  function releaseCommand(command: VoidCommand) {
    if (commandRef.current !== command) return
    commandRef.current = null
    inFlightRef.current = false
    setCommandPhase('idle')
  }

  function runVoid(command: VoidCommand, retry = false) {
    if (retry) {
      if (
        commandRef.current !== command ||
        !command.unknownObserved ||
        commandPhase !== 'unknown' ||
        inFlightRef.current ||
        !isCurrentCommand(command)
      ) {
        return
      }
    } else {
      if (commandRef.current || !mountedRef.current || !isCurrentScope(command)) {
        return
      }
      commandRef.current = command
    }

    inFlightRef.current = true
    setError(null)
    setNotice(null)
    setCommandPhase('pending')
    startTransition(() => {
      void (async () => {
        let result: unknown
        try {
          result = await deleteCostEntryAction(
            command.entryId,
            command.projectId,
            command.reason,
            command.requestId,
            { tenantId: command.tenantId, actorId: command.actorId },
          )
        } catch {
          markUnknown(command)
          return
        }

        if (!isCurrentCommand(command)) {
          if (mountedRef.current && commandRef.current === command) {
            commandRef.current = null
            inFlightRef.current = false
            setCommandPhase('idle')
          }
          return
        }
        if (isOutcomeUnknown(result)) {
          markUnknown(command)
          return
        }

        const receipt = validateDeleteReceipt(result, command)
        if (!receipt) {
          const knownError = actionError(result)
          if (knownError && !command.unknownObserved) {
            releaseCommand(command)
            if (mountedRef.current) setError(knownError)
          } else {
            markUnknown(command)
          }
          return
        }

        let refreshFailed = false
        try {
          router.refresh()
        } catch {
          refreshFailed = true
        }
        if (!isCurrentCommand(command)) {
          if (mountedRef.current && commandRef.current === command) {
            commandRef.current = null
            inFlightRef.current = false
            setCommandPhase('idle')
          }
          return
        }
        setVoidedIds((current) => new Set([...current, command.entryId]))
        releaseCommand(command)
        setError(null)
        if (mountedRef.current) {
          setNotice(
            withRefreshOutcome(
              'Cost entry void committed.',
              receipt.refreshWarning,
              refreshFailed,
            ),
          )
        }
      })()
    })
  }

  function retryVoid() {
    const command = commandRef.current
    if (canRecord && command) runVoid(command, true)
  }

  function remove(entry: CostRow) {
    if (
      entry.cost_source !== 'manual' ||
      voidedIds.has(entry.id) ||
      commandRef.current ||
      !mountedRef.current ||
      !canRecord ||
      !sameUuid(projectId, scopeRef.current.projectId)
    ) {
      return
    }

    const command: VoidCommand = {
      entryId: entry.id,
      projectId,
      tenantId,
      actorId,
      reason: 'Manual cost correction',
      requestId: crypto.randomUUID(),
      unknownObserved: false,
    }
    runVoid(command)
  }

  return (
    <>
      {error && (
        <div className="cost-form__error" role="alert" style={{ padding: '8px 16px' }}>
          <span>{error}</span>
          {canRecord && commandPhase === 'unknown' && (
            <button
              type="button"
              className="cost-cancel-btn"
              onClick={retryVoid}
            >
              Retry void
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="cost-section-sub" role="status" style={{ padding: '8px 16px' }}>
          {notice}
        </p>
      )}
      {entries.length === 0 ? (
        <div className="card-empty">
          No cost entries recorded yet. Log the first one to start tracking actuals.
        </div>
      ) : (
        <table className="data-table cost-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Source</th>
              <th>Ref #</th>
              <th className="num">Amount</th>
              {canRecord && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const systemManaged = entry.cost_source !== 'manual'
              const voided = voidedIds.has(entry.id)
              const currentCommand = commandRef.current
              const thisRowPending =
                currentCommand?.entryId === entry.id && commandPhase === 'pending'
              return (
                <tr key={entry.id}>
                  <td>
                    {new Date(entry.incurred_at).toLocaleDateString('en-PH', {
                      timeZone: 'Asia/Manila',
                    })}
                  </td>
                  <td>{entry.description}</td>
                  <td>{CATEGORY_LABEL[entry.cost_category] ?? entry.cost_category}</td>
                  <td>
                    <span className="cost-source-tag">
                      {sourceLabel(entry.cost_source)}
                    </span>
                  </td>
                  <td>{entry.reference_number ?? '—'}</td>
                  <td className="num mono">{php(entry.amount_cents)}</td>
                  {canRecord && (
                    <td className="num">
                      {systemManaged ? (
                        <span className="cost-locked" title="System-managed">
                          🔒 System-managed
                        </span>
                      ) : voided ? (
                        <span className="cost-locked">Voided</span>
                      ) : (
                        <button
                          type="button"
                          className="cost-del-btn"
                          onClick={() => remove(entry)}
                          disabled={commandBusy}
                          aria-label={`${thisRowPending ? 'Voiding' : 'Void'} ${entry.description}`}
                        >
                          {thisRowPending ? 'Voiding…' : 'Void'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
