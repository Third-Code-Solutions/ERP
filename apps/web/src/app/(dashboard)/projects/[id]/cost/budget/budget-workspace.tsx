'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  approveProjectBudget,
  createCostCode,
  createProjectBudget,
  rejectProjectBudget,
  reviseProjectBudget,
  saveProjectBudget,
  submitProjectBudget,
} from '@/app/(dashboard)/projects/[id]/cost/budget/actions'
import { parsePesosToCents } from '@/lib/operations/scope-money'
import {
  budgetWorkflowCommandIsScoped,
  hasSuccessfulActionResult,
  isUnconfirmedResult,
  messageFrom,
  nextBudgetWorkflowRequestId,
  refreshWarningFrom,
  UNCONFIRMED_WORKFLOW_MESSAGE,
  validateBudgetWorkflowReceipt,
  withRefreshOutcome,
  workflowMessage,
  type BudgetWorkflowCommand,
} from './budget-workflow-receipts'

export { validateBudgetWorkflowReceipt } from './budget-workflow-receipts'

export interface BudgetCodeOption {
  id: string
  code: string
  name: string
  category: string
}

export interface BudgetBomLineOption {
  id: string
  bomId: string
  label: string
}

export interface BudgetDraft {
  id: string
  revision: number
  sourceBomId: string | null
  controlMode: 'monitor' | 'warn' | 'block'
  toleranceBps: number
  currency: string
  effectiveFrom: string
  reason: string
  lines: Array<{
    id: string
    costCodeId: string
    bomLineItemId: string | null
    description: string
    amountCents: number
  }>
}

interface Props {
  projectId: string
  canViewBom: boolean
  canManage: boolean
  canCommercialApprove: boolean
  canFinanceApprove: boolean
  ownerOverride?: boolean
  draft: BudgetDraft | null
  pendingBudget: {
    id: string
    revision: number
    commercialApprovedBy: string | null
    financeApprovedBy: string | null
  } | null
  approvedBudget: { id: string; revision: number } | null
  codes: BudgetCodeOption[]
  sourceBoms: Array<{ id: string; label: string }>
  bomLines: BudgetBomLineOption[]
}

type EditorLine = {
  key: string
  persistedId: string | null
  costCodeId: string
  bomLineItemId: string
  description: string
  amountPhp: string
}

type DraftSettings = {
  controlMode: BudgetDraft['controlMode']
  toleranceBps: string
  currency: string
  effectiveFrom: string
  reason: string
}

type DraftLineField =
  | 'costCodeId'
  | 'bomLineItemId'
  | 'description'
  | 'amountPhp'

type DraftSettingsField = keyof DraftSettings

type WorkflowCommand = BudgetWorkflowCommand

type WorkflowState =
  | { phase: 'idle' }
  | { phase: 'pending' | 'unknown'; command: WorkflowCommand }

type DraftServerLine = BudgetDraft['lines'][number]

export function reconcileSavedLineIdentities(
  current: EditorLine[],
  saved: Array<{ id: string; clientKey?: string }>
): EditorLine[] {
  const persistedByClientKey = new Map(
    saved.flatMap((line) =>
      line.clientKey ? [[line.clientKey, line.id] as const] : []
    )
  )
  return current.map((line) => ({
    ...line,
    persistedId: persistedByClientKey.get(line.key) ?? line.persistedId,
  }))
}

const CATEGORIES = [
  ['material', 'Material'],
  ['labour', 'Labour'],
  ['subcontractor', 'Subcontractor'],
  ['equipment', 'Equipment'],
  ['overhead', 'Overhead'],
  ['other', 'Other'],
] as const

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatCents(cents: number | bigint): string {
  const value = typeof cents === 'bigint' ? cents : BigInt(cents)
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, '0')
  return `${whole.toLocaleString('en-PH')}.${fraction}`
}

function editorLineFromServer(line: DraftServerLine): EditorLine {
  return {
    key: line.id,
    persistedId: line.id,
    costCodeId: line.costCodeId,
    bomLineItemId: line.bomLineItemId ?? '',
    description: line.description,
    amountPhp: formatCents(line.amountCents),
  }
}

function draftSettingsFromServer(draft: BudgetDraft | null): DraftSettings {
  return {
    controlMode: draft?.controlMode ?? 'warn',
    toleranceBps: String(draft?.toleranceBps ?? 0),
    currency: draft?.currency ?? 'PHP',
    effectiveFrom: draft?.effectiveFrom ?? today(),
    reason: draft?.reason ?? '',
  }
}

function serverLinesFromDraft(draft: BudgetDraft | null): EditorLine[] {
  return draft?.lines.map(editorLineFromServer) ?? []
}

function draftIdentity(draft: BudgetDraft | null): string | null {
  return draft ? `${draft.id}:${draft.revision}` : null
}

function editorLineValuesEqual(left: EditorLine, right: EditorLine): boolean {
  return (
    left.costCodeId === right.costCodeId &&
    left.bomLineItemId === right.bomLineItemId &&
    left.description === right.description &&
    left.amountPhp === right.amountPhp
  )
}

export function mergeBudgetEditorLines(
  current: EditorLine[],
  previousServer: EditorLine[],
  nextServer: EditorLine[],
  dirtyFields: ReadonlyMap<string, ReadonlySet<DraftLineField>> = new Map()
): EditorLine[] {
  const previousById = new Map(
    previousServer.flatMap((line) =>
      line.persistedId ? [[line.persistedId, line] as const] : []
    )
  )
  const currentById = new Map(
    current.flatMap((line) =>
      line.persistedId ? [[line.persistedId, line] as const] : []
    )
  )
  const consumedIds = new Set<string>()

  const merged = nextServer.map((serverLine) => {
    const serverId = serverLine.persistedId
    const currentLine = serverId
      ? currentById.get(serverId)
      : current.find((line) => line.key === serverLine.key)
    if (!currentLine) return serverLine
    if (serverId) consumedIds.add(serverId)

    const previousLine = serverId ? previousById.get(serverId) : undefined
    if (!previousLine) {
      return { ...currentLine, persistedId: serverId }
    }

    return {
      ...currentLine,
      persistedId: serverId,
      costCodeId:
        !dirtyFields.get(currentLine.key)?.has('costCodeId') &&
        currentLine.costCodeId === previousLine.costCodeId
          ? serverLine.costCodeId
          : currentLine.costCodeId,
      bomLineItemId:
        !dirtyFields.get(currentLine.key)?.has('bomLineItemId') &&
        currentLine.bomLineItemId === previousLine.bomLineItemId
          ? serverLine.bomLineItemId
          : currentLine.bomLineItemId,
      description:
        !dirtyFields.get(currentLine.key)?.has('description') &&
        currentLine.description === previousLine.description
          ? serverLine.description
          : currentLine.description,
      amountPhp:
        !dirtyFields.get(currentLine.key)?.has('amountPhp') &&
        currentLine.amountPhp === previousLine.amountPhp
          ? serverLine.amountPhp
          : currentLine.amountPhp,
    }
  })

  for (const currentLine of current) {
    if (!currentLine.persistedId || consumedIds.has(currentLine.persistedId)) {
      if (!currentLine.persistedId) merged.push(currentLine)
      continue
    }

    const previousLine = previousById.get(currentLine.persistedId)
    if (!previousLine || !editorLineValuesEqual(currentLine, previousLine)) {
      merged.push(currentLine)
    }
  }

  return merged
}

function mergeDraftSettings(
  current: DraftSettings,
  previousServer: DraftSettings | null,
  nextServer: DraftSettings,
  dirtyFields: ReadonlySet<DraftSettingsField> = new Set()
): DraftSettings {
  if (!previousServer) return current

  return {
    controlMode:
      !dirtyFields.has('controlMode') &&
      current.controlMode === previousServer.controlMode
        ? nextServer.controlMode
        : current.controlMode,
    toleranceBps:
      !dirtyFields.has('toleranceBps') &&
      current.toleranceBps === previousServer.toleranceBps
        ? nextServer.toleranceBps
        : current.toleranceBps,
    currency:
      !dirtyFields.has('currency') &&
      current.currency === previousServer.currency
        ? nextServer.currency
        : current.currency,
    effectiveFrom:
      !dirtyFields.has('effectiveFrom') &&
      current.effectiveFrom === previousServer.effectiveFrom
        ? nextServer.effectiveFrom
        : current.effectiveFrom,
    reason:
      !dirtyFields.has('reason') &&
      current.reason === previousServer.reason
        ? nextServer.reason
        : current.reason,
  }
}

function hasUnsavedDraftEdits(
  draft: BudgetDraft,
  lines: EditorLine[],
  selectedSourceBomId: string,
  settings: DraftSettings
): boolean {
  if (selectedSourceBomId !== (draft.sourceBomId ?? '')) return true
  if (
    settings.controlMode !== draft.controlMode ||
    settings.toleranceBps !== String(draft.toleranceBps) ||
    settings.currency !== draft.currency ||
    settings.effectiveFrom !== draft.effectiveFrom ||
    settings.reason !== draft.reason
  ) {
    return true
  }
  if (lines.length !== draft.lines.length) return true

  const serverById = new Map(draft.lines.map((line) => [line.id, line]))
  return lines.some((line) => {
    if (!line.persistedId) return true
    const serverLine = serverById.get(line.persistedId)
    if (!serverLine) return true
    return !editorLineValuesEqual(line, editorLineFromServer(serverLine))
  })
}

type RevisionAction = (
  projectId: string,
  budgetId: string,
  reason: string,
  requestId?: string
) => Promise<unknown>

const revisionAction: RevisionAction = reviseProjectBudget

function BudgetWorkspaceContent({
  projectId,
  canViewBom,
  canManage,
  canCommercialApprove,
  canFinanceApprove,
  ownerOverride = false,
  draft,
  pendingBudget,
  approvedBudget,
  codes,
  sourceBoms,
  bomLines,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ordinaryBusy, setOrdinaryBusy] = useState(false)
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    phase: 'idle',
  })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [revisionReason, setRevisionReason] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const serverLines = useMemo(() => serverLinesFromDraft(draft), [draft])
  const initialLines = useMemo<EditorLine[]>(() => {
    if (serverLines.length > 0) return serverLines
    return codes[0]
      ? [
          {
            key: crypto.randomUUID(),
            persistedId: null,
            costCodeId: codes[0].id,
            bomLineItemId: '',
            description: codes[0].name,
            amountPhp: '',
          },
        ]
      : []
  }, [codes, serverLines])
  const serverSettings = useMemo(
    () => (draft ? draftSettingsFromServer(draft) : null),
    [draft]
  )
  const initialSettings = useMemo(
    () => draftSettingsFromServer(draft),
    [draft]
  )
  const [selectedSourceBomId, setSelectedSourceBomId] = useState(
    draft?.sourceBomId ?? ''
  )
  const [lines, setLines] = useState(initialLines)
  const [draftSettings, setDraftSettings] = useState(initialSettings)
  const mountedRef = useRef(false)
  const activeKindRef = useRef<'ordinary' | 'workflow' | null>(null)
  const workflowCommandRef = useRef<WorkflowCommand | null>(null)
  const previousDraftIdentityRef = useRef(draftIdentity(draft))
  const previousServerLinesRef = useRef(serverLines)
  const previousServerSettingsRef = useRef(serverSettings)
  const previousSourceBomIdRef = useRef(draft?.sourceBomId ?? '')
  const dirtyLineFieldsRef = useRef(
    new Map<string, Set<DraftLineField>>()
  )
  const dirtySettingsFieldsRef = useRef(new Set<DraftSettingsField>())
  const sourceBomDirtyRef = useRef(false)
  const scopeRef = useRef({
    projectId,
    draftId: draft?.id ?? null,
    pendingBudgetId: pendingBudget?.id ?? null,
    approvedBudgetId: approvedBudget?.id ?? null,
  })

  scopeRef.current = {
    projectId,
    draftId: draft?.id ?? null,
    pendingBudgetId: pendingBudget?.id ?? null,
    approvedBudgetId: approvedBudget?.id ?? null,
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const command = workflowCommandRef.current
    if (command && !budgetWorkflowCommandIsScoped(command, scopeRef.current)) {
      activeKindRef.current = null
      workflowCommandRef.current = null
      setWorkflowState({ phase: 'idle' })
      setError(null)
      setNotice(null)
    }
  }, [projectId, draft?.id, pendingBudget?.id, approvedBudget?.id])

  useEffect(() => {
    const nextIdentity = draftIdentity(draft)
    const previousIdentity = previousDraftIdentityRef.current
    if (nextIdentity !== previousIdentity) {
      dirtyLineFieldsRef.current.clear()
      dirtySettingsFieldsRef.current.clear()
      sourceBomDirtyRef.current = false
      setLines(draft ? serverLines : initialLines)
      setDraftSettings(serverSettings ?? initialSettings)
      setSelectedSourceBomId(draft?.sourceBomId ?? '')
    } else if (draft && serverSettings) {
      setLines((current) =>
        mergeBudgetEditorLines(
          current,
          previousServerLinesRef.current,
          serverLines,
          dirtyLineFieldsRef.current
        )
      )
      setDraftSettings((current) =>
        mergeDraftSettings(
          current,
          previousServerSettingsRef.current,
          serverSettings,
          dirtySettingsFieldsRef.current
        )
      )
      setSelectedSourceBomId((current) =>
        !sourceBomDirtyRef.current &&
        current === previousSourceBomIdRef.current
          ? draft.sourceBomId ?? ''
          : current
      )
    }

    previousDraftIdentityRef.current = nextIdentity
    previousServerLinesRef.current = serverLines
    previousServerSettingsRef.current = serverSettings
    previousSourceBomIdRef.current = draft?.sourceBomId ?? ''
  }, [draft, initialLines, initialSettings, serverLines, serverSettings])

  const isBusy =
    pending || ordinaryBusy || workflowState.phase === 'pending'
  const workflowLocked = workflowState.phase !== 'idle'

  function finishOrdinaryAction() {
    if (activeKindRef.current !== 'ordinary') return
    activeKindRef.current = null
    setOrdinaryBusy(false)
  }

  function finishWorkflow(command: WorkflowCommand) {
    if (
      activeKindRef.current !== 'workflow' ||
      workflowCommandRef.current !== command
    ) {
      return
    }
    activeKindRef.current = null
    workflowCommandRef.current = null
    setWorkflowState({ phase: 'idle' })
  }

  function markWorkflowUnknown(command: WorkflowCommand) {
    if (
      !mountedRef.current ||
      activeKindRef.current !== 'workflow' ||
      workflowCommandRef.current !== command
    ) {
      return
    }
    if (!commandStillScoped(command)) {
      finishWorkflow(command)
      return
    }
    setError(UNCONFIRMED_WORKFLOW_MESSAGE)
    setNotice(null)
    setWorkflowState({ phase: 'unknown', command })
  }

  function commandStillScoped(command: WorkflowCommand): boolean {
    return budgetWorkflowCommandIsScoped(command, scopeRef.current)
  }

  function run(
    action: () => Promise<unknown>,
    success: string
  ) {
    if (activeKindRef.current !== null || workflowLocked) return
    activeKindRef.current = 'ordinary'
    setOrdinaryBusy(true)
    setError(null)
    setNotice(null)
    startTransition(() => {
      void (async () => {
        try {
          const result = await action()
          const actionError = messageFrom(result)
          if (actionError) {
            if (mountedRef.current) setError(actionError)
            return
          }
          if (!hasSuccessfulActionResult(result)) {
            if (mountedRef.current) {
              setError(
                'Budget action outcome could not be confirmed. Reload before retrying.'
              )
            }
            return
          }

          let refreshFailed = false
          try {
            router.refresh()
          } catch {
            refreshFailed = true
          }
          if (mountedRef.current) {
            setNotice(
              withRefreshOutcome(
                success,
                refreshWarningFrom(result),
                refreshFailed
              )
            )
          }
        } catch {
          if (mountedRef.current) {
            setError('Budget action could not be confirmed. Reload before retrying.')
          }
        } finally {
          finishOrdinaryAction()
        }
      })()
    })
  }

  function runWorkflow(command: WorkflowCommand, retry = false) {
    if (!mountedRef.current || !commandStillScoped(command)) {
      finishWorkflow(command)
      return
    }
    if (retry) {
      if (
        activeKindRef.current !== 'workflow' ||
        workflowCommandRef.current !== command
      ) {
        return
      }
    } else if (activeKindRef.current !== null) {
      return
    } else {
      activeKindRef.current = 'workflow'
      workflowCommandRef.current = command
    }

    setError(null)
    setNotice(null)
    setWorkflowState({ phase: 'pending', command })
    startTransition(() => {
      void (async () => {
        let result: unknown
        try {
          result = await command.invoke()
        } catch {
          markWorkflowUnknown(command)
          return
        }

        if (
          !mountedRef.current ||
          activeKindRef.current !== 'workflow' ||
          workflowCommandRef.current !== command
        ) return

        if (!commandStillScoped(command)) {
          finishWorkflow(command)
          return
        }

        if (isUnconfirmedResult(result)) {
          markWorkflowUnknown(command)
          return
        }

        const receipt = validateBudgetWorkflowReceipt(result, command)
        if (!receipt) {
          const actionError = messageFrom(result)
          if (actionError) {
            finishWorkflow(command)
            if (mountedRef.current) setError(actionError)
          } else {
            markWorkflowUnknown(command)
          }
          return
        }

        if (!commandStillScoped(command)) {
          finishWorkflow(command)
          return
        }

        let refreshFailed = false
        try {
          router.refresh()
        } catch {
          refreshFailed = true
        }
        finishWorkflow(command)
        if (mountedRef.current) {
          setNotice(
            withRefreshOutcome(
              workflowMessage(command.operation, receipt.status),
              refreshWarningFrom(result),
              refreshFailed
            )
          )
        }
      })()
    })
  }

  function retryWorkflow() {
    if (workflowState.phase !== 'unknown') return
    runWorkflow(workflowState.command, true)
  }

  function workflowButtonLabel(
    operation: WorkflowCommand['operation'],
    idleLabel: string,
    pendingLabel: string
  ): string {
    return workflowState.phase === 'pending' &&
        workflowState.command.operation === operation
      ? pendingLabel
      : idleLabel
  }

  function markLineFieldDirty(key: string, field: DraftLineField) {
    const fields = dirtyLineFieldsRef.current.get(key) ?? new Set<DraftLineField>()
    fields.add(field)
    dirtyLineFieldsRef.current.set(key, fields)
  }

  function markSettingsFieldDirty(field: DraftSettingsField) {
    dirtySettingsFieldsRef.current.add(field)
  }

  function createCodeAction(form: HTMLFormElement) {
    const data = new FormData(form)
    data.set('project_id', projectId)
    run(
      () => createCostCode(data),
      'Cost Code created. It is ready for budget and cost allocation.'
    )
    form.reset()
  }

  function createBudgetAction(form: HTMLFormElement) {
    const data = new FormData(form)
    data.set('project_id', projectId)
    run(
      () => createProjectBudget(data),
      'Draft baseline created. Add controlled budget lines next.'
    )
  }

  function saveDraft(form: HTMLFormElement) {
    if (!draft) return
    const data = new FormData(form)
    data.set('project_id', projectId)
    data.set('budget_id', draft.id)
    data.set(
      'lines',
      JSON.stringify(
        lines.map((line) => ({
          clientKey: line.key,
          ...(line.persistedId ? { id: line.persistedId } : {}),
          costCodeId: line.costCodeId,
          ...(canViewBom
            ? { bomLineItemId: line.bomLineItemId || null }
            : {}),
          description: line.description,
          amountPhp: line.amountPhp,
        }))
      )
    )
    run(async () => {
      const result = await saveProjectBudget(data)
      if (result.ok) {
        dirtyLineFieldsRef.current.clear()
        dirtySettingsFieldsRef.current.clear()
        sourceBomDirtyRef.current = false
        setLines((current) =>
          reconcileSavedLineIdentities(current, result.lines)
        )
      }
      return result
    }, 'Draft baseline saved.')
  }

  function submitDraft() {
    if (!draft) return
    if (
      hasUnsavedDraftEdits(
        draft,
        lines,
        selectedSourceBomId,
        draftSettings
      )
    ) {
      setError('Save the draft before submitting; the current editor has unsaved changes.')
      setNotice(null)
      return
    }

    const scopedProjectId = projectId
    const scopedBudgetId = draft.id
    runWorkflow({
      projectId: scopedProjectId,
      sourceBudgetId: scopedBudgetId,
      operation: 'submit',
      invoke: () => submitProjectBudget(scopedProjectId, scopedBudgetId),
    })
  }

  function approveLane(lane: 'commercial' | 'finance') {
    if (!pendingBudget) return
    if (ownerOverride && !window.confirm(
      'Owner approval fills any remaining approval lane and locks the Project Budget baseline. Continue?'
    )) {
      return
    }

    const scopedProjectId = projectId
    const scopedBudgetId = pendingBudget.id
    runWorkflow({
      projectId: scopedProjectId,
      sourceBudgetId: scopedBudgetId,
      operation: lane,
      invoke: () =>
        approveProjectBudget(scopedProjectId, scopedBudgetId, lane),
    })
  }

  function rejectRevision() {
    if (!pendingBudget) return
    const scopedProjectId = projectId
    const scopedBudgetId = pendingBudget.id
    const exactReason = rejectionReason
    runWorkflow({
      projectId: scopedProjectId,
      sourceBudgetId: scopedBudgetId,
      operation: 'reject',
      invoke: () =>
        rejectProjectBudget(scopedProjectId, scopedBudgetId, exactReason),
    })
  }

  function createRevision() {
    if (!approvedBudget) return
    const scopedProjectId = projectId
    const scopedBudgetId = approvedBudget.id
    const exactReason = revisionReason
    const requestId = nextBudgetWorkflowRequestId()
    runWorkflow({
      projectId: scopedProjectId,
      sourceBudgetId: scopedBudgetId,
      operation: 'revise',
      requestId,
      invoke: () =>
        revisionAction(
          scopedProjectId,
          scopedBudgetId,
          exactReason,
          requestId
        ),
    })
  }

  function addLine() {
    const unused = codes.find(
      (code) => !lines.some((line) => line.costCodeId === code.id)
    )
    if (!unused) {
      setError('Create another Cost Code before adding a budget line.')
      return
    }
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        persistedId: null,
        costCodeId: unused.id,
        bomLineItemId: '',
        description: unused.name,
        amountPhp: '',
      },
    ])
  }

  const visibleBomLines = bomLines.filter(
    (line) => !selectedSourceBomId || line.bomId === selectedSourceBomId
  )
  const lineTotalCents = lines.reduce((total, line) => {
    const cents = parsePesosToCents(line.amountPhp)
    return cents === undefined ? total : total + BigInt(cents)
  }, 0n)

  return (
    <div className="budget-workspace">
      {(error || notice) && (
        <div
          className={`budget-message ${error ? 'budget-message-error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          {error ?? notice}
          {workflowState.phase === 'unknown' && (
            <button
              className="finance-secondary-button"
              type="button"
              onClick={retryWorkflow}
              disabled={pending}
            >
              Retry budget workflow
            </button>
          )}
        </div>
      )}

      {canManage && (
        <details className="budget-panel budget-panel-compact">
          <summary>
            <span>
              <strong>Cost Code library</strong>
              <small>
                Stable classifications shared by budgets, commitments, and
                actuals.
              </small>
            </span>
            <span>{codes.length} active</span>
          </summary>
          <form
            className="budget-inline-form"
            onSubmit={(event) => {
              event.preventDefault()
              createCodeAction(event.currentTarget)
            }}
          >
            <label>
              <span>Code</span>
              <input name="code" required maxLength={40} placeholder="MAT-100" />
            </label>
            <label className="budget-grow">
              <span>Name</span>
              <input
                name="name"
                required
                maxLength={160}
                placeholder="Structural materials"
              />
            </label>
            <label>
              <span>Category</span>
              <select name="category" defaultValue="material">
                {CATEGORIES.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="finance-secondary-button"
              type="submit"
              disabled={isBusy || workflowLocked}
            >
              Add code
            </button>
          </form>
          <div className="budget-code-grid">
            {codes.map((code) => (
              <div key={code.id}>
                <code>{code.code}</code>
                <span>{code.name}</span>
                <small>{code.category}</small>
              </div>
            ))}
          </div>
        </details>
      )}

      {!draft && canManage && !approvedBudget && (
        <section className="budget-panel">
          <div className="budget-panel-heading">
            <div>
              <p className="finance-eyebrow">Controlled baseline</p>
              <h2>Create Project Budget</h2>
            </div>
            <p>
              Start a versioned cost baseline. Approval evidence locks the
              revision.
            </p>
          </div>
          <form
            className="budget-create-grid"
            onSubmit={(event) => {
              event.preventDefault()
              createBudgetAction(event.currentTarget)
            }}
          >
            {canViewBom && (
              <label>
                <span>Source BOM</span>
                <select name="source_bom_id" defaultValue="">
                  <option value="">No source BOM</option>
                  {sourceBoms.map((bom) => (
                    <option key={bom.id} value={bom.id}>
                      {bom.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>Control</span>
              <select name="control_mode" defaultValue="warn">
                <option value="monitor">Monitor</option>
                <option value="warn">Warn</option>
                <option value="block">Block overcommit</option>
              </select>
            </label>
            <label>
              <span>Tolerance (basis points)</span>
              <input
                name="tolerance_bps"
                type="number"
                min="0"
                max="10000"
                defaultValue="0"
              />
            </label>
            <label>
              <span>Currency</span>
              <input name="currency" defaultValue="PHP" maxLength={3} required />
            </label>
            <label>
              <span>Effective date</span>
              <input
                name="effective_from"
                type="date"
                defaultValue={today()}
                required
              />
            </label>
            <label className="budget-span-2">
              <span>Revision reason</span>
              <input
                name="revision_reason"
                defaultValue="Initial controlled baseline"
                required
                maxLength={500}
              />
            </label>
            <div className="budget-form-actions">
              <button
                className="finance-primary-button"
                type="submit"
                disabled={isBusy || workflowLocked || codes.length === 0}
              >
                Create draft
              </button>
              {codes.length === 0 && (
                <small>Create at least one Cost Code first.</small>
              )}
            </div>
          </form>
        </section>
      )}

      {draft && canManage && (
        <section className="budget-panel">
          <div className="budget-panel-heading">
            <div>
              <p className="finance-eyebrow">
                Revision {draft.revision} · Draft
              </p>
              <h2>Build the baseline</h2>
            </div>
            <div className="budget-draft-total">
              <span>Draft total</span>
              <strong>
                {draft.currency}{' '}
                {formatCents(lineTotalCents)}
              </strong>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              saveDraft(event.currentTarget)
            }}
          >
            <div className="budget-create-grid budget-draft-settings">
              {canViewBom && (
                <label>
                  <span>Source BOM</span>
                  <select
                    name="source_bom_id"
                    value={selectedSourceBomId}
                    disabled={isBusy || workflowLocked}
                    onChange={(event) => {
                      const nextSourceBomId = event.currentTarget.value
                      sourceBomDirtyRef.current = true
                      for (const line of lines) {
                        markLineFieldDirty(line.key, 'bomLineItemId')
                      }
                      setSelectedSourceBomId(nextSourceBomId)
                      setLines((current) =>
                        current.map((line) => ({
                          ...line,
                          bomLineItemId: '',
                        }))
                      )
                    }}
                  >
                    <option value="">No source BOM</option>
                    {sourceBoms.map((bom) => (
                      <option key={bom.id} value={bom.id}>
                        {bom.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span>Control</span>
                <select
                  name="control_mode"
                  value={draftSettings.controlMode}
                  disabled={isBusy || workflowLocked}
                  onChange={(event) => {
                    const value = event.currentTarget.value as DraftSettings['controlMode']
                    markSettingsFieldDirty('controlMode')
                    setDraftSettings((current) => ({
                      ...current,
                      controlMode: value,
                    }))
                  }}
                >
                  <option value="monitor">Monitor</option>
                  <option value="warn">Warn</option>
                  <option value="block">Block overcommit</option>
                </select>
              </label>
              <label>
                <span>Tolerance (basis points)</span>
                <input
                  name="tolerance_bps"
                  type="number"
                  min="0"
                  max="10000"
                  value={draftSettings.toleranceBps}
                  disabled={isBusy || workflowLocked}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    markSettingsFieldDirty('toleranceBps')
                    setDraftSettings((current) => ({
                      ...current,
                      toleranceBps: value,
                    }))
                  }}
                />
              </label>
              <label>
                <span>Currency</span>
                <input
                  name="currency"
                  value={draftSettings.currency}
                  maxLength={3}
                  required
                  disabled={isBusy || workflowLocked}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    markSettingsFieldDirty('currency')
                    setDraftSettings((current) => ({
                      ...current,
                      currency: value,
                    }))
                  }}
                />
              </label>
              <label>
                <span>Effective date</span>
                <input
                  name="effective_from"
                  type="date"
                  value={draftSettings.effectiveFrom}
                  required
                  disabled={isBusy || workflowLocked}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    markSettingsFieldDirty('effectiveFrom')
                    setDraftSettings((current) => ({
                      ...current,
                      effectiveFrom: value,
                    }))
                  }}
                />
              </label>
              <label className="budget-span-2">
                <span>Revision reason</span>
                <input
                  name="revision_reason"
                  value={draftSettings.reason}
                  required
                  maxLength={500}
                  disabled={isBusy || workflowLocked}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    markSettingsFieldDirty('reason')
                    setDraftSettings((current) => ({
                      ...current,
                      reason: value,
                    }))
                  }}
                />
              </label>
            </div>

            <div className="budget-line-shell">
              <div className="budget-line-head">
                <span>Cost Code</span>
                {canViewBom ? <span>Source evidence</span> : <span />}
                <span>Description</span>
                <span>Baseline amount</span>
                <span />
              </div>
              {lines.map((line, index) => (
                <div className="budget-line" key={line.key}>
                  <select
                    aria-label={`Cost Code ${index + 1}`}
                    value={line.costCodeId}
                    disabled={isBusy || workflowLocked}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      const selected = codes.find(
                        (code) => code.id === value
                      )
                      markLineFieldDirty(line.key, 'costCodeId')
                      setLines((current) =>
                        current.map((item) =>
                          item.key === line.key
                            ? {
                                ...item,
                                costCodeId: value,
                                description:
                                  item.description || selected?.name || '',
                              }
                            : item
                        )
                      )
                    }}
                    required
                  >
                    {codes.map((code) => (
                      <option value={code.id} key={code.id}>
                        {code.code} · {code.name}
                      </option>
                    ))}
                  </select>
                  {canViewBom ? (
                    <select
                      aria-label={`Source BOM line ${index + 1}`}
                      value={line.bomLineItemId}
                      disabled={isBusy || workflowLocked}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        markLineFieldDirty(line.key, 'bomLineItemId')
                        setLines((current) =>
                          current.map((item) =>
                            item.key === line.key
                              ? { ...item, bomLineItemId: value }
                              : item
                          )
                        )
                      }}
                    >
                      <option value="">No linked BOM line</option>
                      {visibleBomLines.map((bomLine) => (
                        <option value={bomLine.id} key={bomLine.id}>
                          {bomLine.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span />
                  )}
                  <input
                    aria-label={`Description ${index + 1}`}
                    value={line.description}
                    maxLength={500}
                    required
                    disabled={isBusy || workflowLocked}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      markLineFieldDirty(line.key, 'description')
                      setLines((current) =>
                        current.map((item) =>
                          item.key === line.key
                            ? { ...item, description: value }
                            : item
                        )
                      )
                    }}
                  />
                  <input
                    aria-label={`Baseline amount ${index + 1}`}
                    value={line.amountPhp}
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    disabled={isBusy || workflowLocked}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      markLineFieldDirty(line.key, 'amountPhp')
                      setLines((current) =>
                        current.map((item) =>
                          item.key === line.key
                            ? { ...item, amountPhp: value }
                            : item
                        )
                      )
                    }}
                  />
                  <button
                    type="button"
                    className="finance-text-button"
                    disabled={isBusy || workflowLocked || lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.key !== line.key)
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="budget-form-actions budget-form-actions-split">
              <button
                className="finance-secondary-button"
                type="button"
                onClick={addLine}
                disabled={isBusy || workflowLocked || lines.length >= codes.length}
              >
                Add Cost Code
              </button>
              <div>
                <button
                  className="finance-secondary-button"
                  type="submit"
                  disabled={isBusy || workflowLocked}
                >
                  Save draft
                </button>
                <button
                  className="finance-primary-button"
                  type="button"
                  disabled={isBusy || workflowLocked || lines.length === 0}
                  onClick={submitDraft}
                >
                  {workflowButtonLabel(
                    'submit',
                    'Submit for approval',
                    'Submitting…'
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {pendingBudget && (
        <section className="budget-panel budget-review-panel">
          <div className="budget-panel-heading">
            <div>
              <p className="finance-eyebrow">
                Revision {pendingBudget.revision} · Approval
              </p>
              <h2>Independent review</h2>
            </div>
            <p>Commercial validates scope. Finance validates funding.</p>
          </div>
          {ownerOverride && (
            <p role="note">
              Owner approval fills any remaining approval lane and locks the
              baseline once both lanes pass.
            </p>
          )}
          <div className="budget-approval-lanes">
            <div
              className={
                pendingBudget.commercialApprovedBy ? 'is-approved' : ''
              }
            >
              <span>01</span>
              <strong>Commercial</strong>
              <small>
                {pendingBudget.commercialApprovedBy
                  ? 'Approval captured'
                  : 'Awaiting approver'}
              </small>
              {canCommercialApprove &&
                !pendingBudget.commercialApprovedBy && (
                  <button
                    className="finance-primary-button"
                    type="button"
                    disabled={isBusy || workflowLocked}
                    onClick={() => approveLane('commercial')}
                  >
                    {workflowButtonLabel(
                      'commercial',
                      ownerOverride ? 'Approve & lock baseline' : 'Approve lane',
                      'Approving commercial…'
                    )}
                  </button>
                )}
            </div>
            <div className={pendingBudget.financeApprovedBy ? 'is-approved' : ''}>
              <span>02</span>
              <strong>Finance</strong>
              <small>
                {pendingBudget.financeApprovedBy
                  ? 'Approval captured'
                  : 'Awaiting approver'}
              </small>
              {canFinanceApprove && !pendingBudget.financeApprovedBy && (
                <button
                  className="finance-primary-button"
                  type="button"
                  disabled={isBusy || workflowLocked}
                  onClick={() => approveLane('finance')}
                >
                  {workflowButtonLabel(
                    'finance',
                    ownerOverride ? 'Approve & lock baseline' : 'Approve lane',
                    'Approving finance…'
                  )}
                </button>
              )}
            </div>
          </div>
          {(canCommercialApprove || canFinanceApprove) && (
            <div className="budget-reject-row">
              <input
                value={rejectionReason}
                disabled={isBusy || workflowLocked}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Reason for returning this revision"
                maxLength={1000}
              />
              <button
                type="button"
                className="finance-danger-button"
                disabled={
                  isBusy ||
                  workflowLocked ||
                  rejectionReason.trim().length < 3
                }
                onClick={rejectRevision}
              >
                {workflowButtonLabel(
                  'reject',
                  'Reject revision',
                  'Rejecting revision…'
                )}
              </button>
            </div>
          )}
        </section>
      )}

      {approvedBudget && !draft && !pendingBudget && canManage && (
        <section className="budget-panel budget-revision-panel">
          <div>
            <p className="finance-eyebrow">Controlled change</p>
            <h2>Revise the approved baseline</h2>
            <p>
              Revision {approvedBudget.revision} stays effective until the new
              draft receives both approvals.
            </p>
          </div>
          <div>
            <input
              value={revisionReason}
              disabled={isBusy || workflowLocked}
              onChange={(event) => setRevisionReason(event.target.value)}
              maxLength={500}
              placeholder="Why is the baseline changing?"
            />
            <button
              type="button"
              className="finance-primary-button"
              disabled={isBusy || workflowLocked || revisionReason.trim().length < 3}
              onClick={createRevision}
            >
              {workflowButtonLabel(
                'revise',
                'Create revision',
                'Creating revision…'
              )}
            </button>
          </div>
        </section>
  )}
    </div>
  )
}

export function BudgetWorkspace(props: Props) {
  return <BudgetWorkspaceContent key={props.projectId} {...props} />
}
