'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { createCostEntry } from '@/app/(dashboard)/projects/[id]/cost/actions'

type CostCategory =
  | 'material'
  | 'labour'
  | 'subcontractor'
  | 'equipment'
  | 'overhead'
  | 'other'

interface CostCodeOption {
  id: string
  code: string
  name: string
  category: CostCategory
}

type ManualCostReceipt = {
  tenantId: string
  projectId: string
  actorId: string
  requestId: string
  costEntryId: string
}

type CreateCommand = {
  formData: FormData
  form: HTMLFormElement
  projectId: string
  tenantId: string
  actorId: string
  requestId: string
  unknownObserved: boolean
}

type CommandPhase = 'idle' | 'pending' | 'unknown'

const uuidSchema = z.string().uuid()
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
const createSuccessSchema = z.object({
  id: uuidSchema,
  receipt: manualCostReceiptSchema,
  refreshWarning: z.string().max(500).optional(),
})

const UNCONFIRMED_CREATE_MESSAGE =
  'Cost entry outcome is unconfirmed. The exact request is retained; retry it to reconcile the saved result.'

type CreateCostEntryAction = (formData: FormData) => Promise<unknown>
const createCostEntryAction: CreateCostEntryAction = createCostEntry

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

function cloneFormData(source: FormData): FormData {
  const clone = new FormData()
  source.forEach((value, key) => clone.append(key, value))
  return clone
}

function actionError(result: unknown): string | null {
  if (!isRecord(result) || typeof result.error !== 'string') return null
  const message = result.error.trim()
  return message.length > 0 ? message.slice(0, 500) : 'Could not record the cost entry.'
}

function isOutcomeUnknown(result: unknown): boolean {
  return isRecord(result) && result.outcomeUnknown === true
}

function validateCreateReceipt(
  result: unknown,
  command: Pick<CreateCommand, 'projectId' | 'tenantId' | 'actorId' | 'requestId'>,
): (ManualCostReceipt & { id: string; refreshWarning?: string }) | null {
  const parsed = createSuccessSchema.safeParse(result)
  if (!parsed.success) return null
  const { id, receipt, refreshWarning } = parsed.data
  if (
    !sameUuid(receipt.tenantId, command.tenantId) ||
    !sameUuid(receipt.projectId, command.projectId) ||
    !sameUuid(receipt.actorId, command.actorId) ||
    receipt.requestId !== command.requestId ||
    !sameUuid(receipt.costEntryId, id)
  ) {
    return null
  }
  return { id, ...receipt, ...(refreshWarning ? { refreshWarning } : {}) }
}

function withRefreshOutcome(
  message: string,
  refreshWarning: string | undefined,
  refreshFailed: boolean,
): string {
  const additions = [
    refreshWarning ? `Refresh warning: ${refreshWarning}` : null,
    refreshFailed
      ? 'The cost entry committed, but the page could not refresh. Reload to view the latest log.'
      : null,
  ].filter((value): value is string => value !== null)
  return additions.length > 0 ? `${message} ${additions.join(' ')}` : message
}

export function CostEntryForm({
  projectId,
  tenantId,
  actorId,
  costCodes,
}: {
  projectId: string
  tenantId: string
  actorId: string
  costCodes: CostCodeOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [commandPhase, setCommandPhase] = useState<CommandPhase>('idle')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [selectedCodeId, setSelectedCodeId] = useState(costCodes[0]?.id ?? '')
  const mountedRef = useRef(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const inFlightRef = useRef(false)
  const scopeRef = useRef({ projectId, tenantId, actorId })
  const commandRef = useRef<CreateCommand | null>(null)
  const selectedCode = costCodes.find((code) => code.id === selectedCodeId)
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
      setOpen(false)
      setIdempotencyKey(crypto.randomUUID())
    }
  }, [actorId, projectId, tenantId])

  function isCurrentCommand(command: CreateCommand): boolean {
    const scope = scopeRef.current
    return (
      mountedRef.current &&
      commandRef.current === command &&
      sameUuid(command.projectId, scope.projectId) &&
      sameUuid(command.tenantId, scope.tenantId) &&
      sameUuid(command.actorId, scope.actorId)
    )
  }

  function markUnknown(command: CreateCommand) {
    if (!isCurrentCommand(command)) return
    command.unknownObserved = true
    inFlightRef.current = false
    setCommandPhase('unknown')
    setNotice(null)
    setError(UNCONFIRMED_CREATE_MESSAGE)
  }

  function releaseCommand(command: CreateCommand) {
    if (commandRef.current !== command) return
    commandRef.current = null
    inFlightRef.current = false
    setCommandPhase('idle')
    setIdempotencyKey(crypto.randomUUID())
  }

  function runCreate(command: CreateCommand, retry = false) {
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
          result = await createCostEntryAction(command.formData)
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

        const receipt = validateCreateReceipt(result, command)
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
        releaseCommand(command)
        if (formRef.current === command.form) command.form.reset()
        setSelectedCodeId(costCodes[0]?.id ?? '')
        setOpen(false)
        setError(null)
        if (mountedRef.current) {
          setNotice(
            withRefreshOutcome(
              'Cost entry committed.',
              receipt.refreshWarning,
              refreshFailed,
            ),
          )
        }
      })()
    })
  }

  function isCurrentScope(
    command: Pick<CreateCommand, 'projectId' | 'tenantId' | 'actorId'>,
  ) {
    return (
      sameUuid(command.projectId, projectId) &&
      sameUuid(command.tenantId, tenantId) &&
      sameUuid(command.actorId, actorId)
    )
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (commandRef.current || commandBusy) return
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('project_id', projectId)
    formData.set('expected_tenant_id', tenantId)
    formData.set('expected_actor_id', actorId)
    const requestId = String(formData.get('idempotency_key') ?? '')
    if (!requestIdSchema.safeParse(requestId).success) {
      setError('Could not prepare a valid cost-entry command. Try again.')
      return
    }
    const command: CreateCommand = {
      formData: cloneFormData(formData),
      form,
      projectId,
      tenantId,
      actorId,
      requestId,
      unknownObserved: false,
    }
    runCreate(command)
  }

  function retryCreate() {
    const command = commandRef.current
    if (command) runCreate(command, true)
  }

  function openForm() {
    setOpen(true)
    setError(null)
    setNotice(null)
  }

  if (!open) {
    return (
      <>
        <button
          type="button"
          className="cost-add-btn"
          onClick={openForm}
          disabled={costCodes.length === 0}
          title={
            costCodes.length === 0
              ? 'Create a Cost Code in Budget Control first'
              : undefined
          }
        >
          + Record cost
        </button>
        {notice && (
          <p className="cost-section-sub" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="cost-form__error" role="alert">
            {error}
          </p>
        )}
      </>
    )
  }

  return (
    <form
      ref={formRef}
      className="cost-form"
      onSubmit={onSubmit}
      aria-busy={commandPhase === 'pending'}
    >
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <input type="hidden" name="expected_tenant_id" value={tenantId} />
      <input type="hidden" name="expected_actor_id" value={actorId} />
      <div className="cost-form__grid">
        <label className="cost-field cost-field--wide" style={{ minWidth: 0 }}>
          <span>Description</span>
          <input
            name="description"
            required
            maxLength={500}
            placeholder="e.g. Site labour — week 12"
            disabled={commandBusy}
          />
        </label>
        <label className="cost-field cost-field--wide" style={{ minWidth: 0 }}>
          <span>Cost Code</span>
          <select
            name="cost_code_id"
            value={selectedCodeId}
            onChange={(event) => setSelectedCodeId(event.currentTarget.value)}
            required
            disabled={commandBusy}
          >
            {costCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.code} · {code.name}
              </option>
            ))}
          </select>
        </label>
        <input
          name="cost_category"
          type="hidden"
          value={selectedCode?.category ?? ''}
        />
        <label className="cost-field" style={{ minWidth: 0 }}>
          <span>Amount (₱)</span>
          <input
            name="amount_php"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            disabled={commandBusy}
          />
        </label>
        <label className="cost-field" style={{ minWidth: 0 }}>
          <span>Qty</span>
          <input
            name="quantity"
            type="number"
            min="1"
            defaultValue={1}
            disabled={commandBusy}
          />
        </label>
        <label className="cost-field" style={{ minWidth: 0 }}>
          <span>Unit</span>
          <input
            name="unit"
            maxLength={20}
            placeholder="lot / pcs / hrs"
            disabled={commandBusy}
          />
        </label>
        <label className="cost-field" style={{ minWidth: 0 }}>
          <span>Date incurred</span>
          <input name="incurred_at" type="date" disabled={commandBusy} />
        </label>
        <label className="cost-field" style={{ minWidth: 0 }}>
          <span>Reference #</span>
          <input
            name="reference_number"
            maxLength={100}
            placeholder="DR / OR no."
            disabled={commandBusy}
          />
        </label>
      </div>
      {error && (
        <div className="cost-form__error" role="alert">
          <span>{error}</span>
          {commandPhase === 'unknown' && (
            <button
              type="button"
              className="cost-cancel-btn"
              onClick={retryCreate}
              disabled={pending}
            >
              Retry save
            </button>
          )}
        </div>
      )}
      <div className="cost-form__actions">
        <button
          type="submit"
          className="cost-add-btn"
          disabled={pending || commandBusy}
        >
          {commandPhase === 'pending' ? 'Saving…' : 'Save cost'}
        </button>
        <button
          type="button"
          className="cost-cancel-btn"
          onClick={() => setOpen(false)}
          disabled={pending || commandBusy}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
