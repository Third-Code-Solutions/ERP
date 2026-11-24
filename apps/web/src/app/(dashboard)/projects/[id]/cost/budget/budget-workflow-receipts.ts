import { z } from 'zod'

export type BudgetWorkflowOperation =
  | 'submit'
  | 'commercial'
  | 'finance'
  | 'reject'
  | 'revise'

export type BudgetWorkflowStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'superseded'

export interface BudgetWorkflowReceipt {
  projectId: string
  sourceBudgetId: string
  operation: BudgetWorkflowOperation
  resultBudgetId: string
  status: BudgetWorkflowStatus
  requestId?: string
}

export type BudgetWorkflowCommand = {
  projectId: string
  sourceBudgetId: string
  operation: BudgetWorkflowOperation
  requestId?: string
  invoke: () => Promise<unknown>
}

export const UNCONFIRMED_WORKFLOW_MESSAGE =
  'Budget workflow outcome is unconfirmed. The exact request is retained; retry it to reconcile the saved result.'

const WORKFLOW_STATUSES: readonly BudgetWorkflowStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'superseded',
]

const WORKFLOW_OPERATIONS: readonly BudgetWorkflowOperation[] = [
  'submit',
  'commercial',
  'finance',
  'reject',
  'revise',
]

function isBudgetWorkflowOperation(
  value: string
): value is BudgetWorkflowOperation {
  return WORKFLOW_OPERATIONS.some((operation) => operation === value)
}

function isBudgetWorkflowStatus(value: string): value is BudgetWorkflowStatus {
  return WORKFLOW_STATUSES.some((status) => status === value)
}

const budgetWorkflowUuidSchema = z.string().guid()

export function normalizeBudgetWorkflowUuid(value: string): string | null {
  const parsed = budgetWorkflowUuidSchema.safeParse(value)
  return parsed.success ? parsed.data.toLowerCase() : null
}

export function sameBudgetWorkflowUuid(
  left: string | null,
  right: string
): boolean {
  const normalizedLeft = left ? normalizeBudgetWorkflowUuid(left) : null
  const normalizedRight = normalizeBudgetWorkflowUuid(right)
  return normalizedLeft !== null && normalizedLeft === normalizedRight
}

export function budgetWorkflowCommandIsScoped(
  command: Pick<BudgetWorkflowCommand, 'projectId' | 'sourceBudgetId' | 'operation'>,
  scope: {
    projectId: string
    draftId: string | null
    pendingBudgetId: string | null
    approvedBudgetId: string | null
  }
): boolean {
  if (!sameBudgetWorkflowUuid(scope.projectId, command.projectId)) return false
  if (command.operation === 'revise') {
    return sameBudgetWorkflowUuid(scope.approvedBudgetId, command.sourceBudgetId)
  }
  return [scope.draftId, scope.pendingBudgetId, scope.approvedBudgetId].some(
    (id) => sameBudgetWorkflowUuid(id, command.sourceBudgetId)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function expectedWorkflowStatuses(
  operation: BudgetWorkflowOperation
): readonly BudgetWorkflowStatus[] {
  switch (operation) {
    case 'submit':
    case 'commercial':
    case 'finance':
      // A replay can report the durable state reached after another lane or
      // later lifecycle transition has already completed.
      return ['pending_approval', 'approved', 'rejected', 'superseded']
    case 'reject':
      return ['rejected']
    case 'revise':
      return WORKFLOW_STATUSES
  }
}

export function validateBudgetWorkflowReceipt(
  result: unknown,
  command: Pick<
    BudgetWorkflowCommand,
    'projectId' | 'sourceBudgetId' | 'operation' | 'requestId'
  >
): BudgetWorkflowReceipt | null {
  if (!isRecord(result) || result.ok !== true) return null
  if (typeof result.id !== 'string' || !isRecord(result.receipt)) return null

  const receipt = result.receipt
  if (
    typeof receipt.projectId !== 'string' ||
    typeof receipt.sourceBudgetId !== 'string' ||
    typeof receipt.operation !== 'string' ||
    typeof receipt.resultBudgetId !== 'string' ||
    typeof receipt.status !== 'string'
  ) {
    return null
  }

  if (
    !isBudgetWorkflowOperation(receipt.operation) ||
    !isBudgetWorkflowStatus(receipt.status)
  ) {
    return null
  }

  const operation = receipt.operation
  const status = receipt.status
  if (!expectedWorkflowStatuses(operation).includes(status)) return null

  const commandProjectId = normalizeBudgetWorkflowUuid(command.projectId)
  const commandSourceBudgetId = normalizeBudgetWorkflowUuid(
    command.sourceBudgetId
  )
  const receiptProjectId = normalizeBudgetWorkflowUuid(receipt.projectId)
  const receiptSourceBudgetId = normalizeBudgetWorkflowUuid(
    receipt.sourceBudgetId
  )
  const resultBudgetId = normalizeBudgetWorkflowUuid(receipt.resultBudgetId)
  const resultId = normalizeBudgetWorkflowUuid(result.id)
  if (
    !commandProjectId ||
    !commandSourceBudgetId ||
    !receiptProjectId ||
    !receiptSourceBudgetId ||
    !resultBudgetId ||
    !resultId
  ) {
    return null
  }

  if (
    resultId !== resultBudgetId ||
    receiptProjectId !== commandProjectId ||
    receiptSourceBudgetId !== commandSourceBudgetId ||
    operation !== command.operation
  ) {
    return null
  }

  if (operation === 'revise') {
    if (
      resultBudgetId === commandSourceBudgetId
    ) {
      return null
    }
  } else if (resultBudgetId !== commandSourceBudgetId) {
    return null
  }

  if (receipt.requestId !== undefined && typeof receipt.requestId !== 'string') {
    return null
  }
  if (command.requestId !== undefined) {
    const commandRequestId = normalizeBudgetWorkflowUuid(command.requestId)
    const receiptRequestId =
      receipt.requestId === undefined
        ? null
        : normalizeBudgetWorkflowUuid(receipt.requestId)
    if (!commandRequestId || !receiptRequestId || commandRequestId !== receiptRequestId) {
      return null
    }
  } else if (receipt.requestId !== undefined) {
    return null
  }

  if (
    result.refreshWarning !== undefined &&
    typeof result.refreshWarning !== 'string'
  ) {
    return null
  }

  return {
    projectId: receipt.projectId,
    sourceBudgetId: receipt.sourceBudgetId,
    operation,
    resultBudgetId: receipt.resultBudgetId,
    status,
    ...(receipt.requestId !== undefined
      ? { requestId: receipt.requestId }
      : {}),
  }
}

export function messageFrom(result: unknown): string | null {
  return isRecord(result) && typeof result.error === 'string'
    ? result.error
    : null
}

export function hasSuccessfulActionResult(result: unknown): boolean {
  return isRecord(result) && result.ok === true
}

export function refreshWarningFrom(result: unknown): string | undefined {
  if (!isRecord(result) || result.refreshWarning === undefined) return undefined
  return typeof result.refreshWarning === 'string'
    ? result.refreshWarning
    : undefined
}

export function isUnconfirmedResult(result: unknown): boolean {
  return isRecord(result) && result.unconfirmed === true
}

export function workflowMessage(
  operation: BudgetWorkflowOperation,
  status: BudgetWorkflowStatus
): string {
  switch (operation) {
    case 'submit':
      switch (status) {
        case 'pending_approval':
          return 'Budget submission committed; awaiting remaining approvals.'
        case 'approved':
          return 'Budget submission recorded; this revision is already approved.'
        case 'rejected':
          return 'Budget submission recorded; this revision is now rejected.'
        case 'superseded':
          return 'Budget submission recorded; this revision is now superseded.'
        case 'draft':
          return 'Budget submission could not be confirmed for a draft result.'
      }
    case 'commercial':
      return laneMessage('Commercial', status)
    case 'finance':
      return laneMessage('Finance', status)
    case 'reject':
      return 'Budget revision rejected; the existing approved baseline remains unchanged.'
    case 'revise':
      switch (status) {
        case 'draft':
          return 'Budget revision committed; the new draft is ready for controlled editing.'
        case 'pending_approval':
          return 'Budget revision recorded; the new revision is pending approval.'
        case 'approved':
          return 'Budget revision recorded; the new revision is already approved.'
        case 'rejected':
          return 'Budget revision recorded; the new revision is now rejected.'
        case 'superseded':
          return 'Budget revision recorded; the new revision is superseded.'
      }
  }
}

function laneMessage(
  lane: 'Commercial' | 'Finance',
  status: BudgetWorkflowStatus
): string {
  switch (status) {
    case 'pending_approval':
      return `${lane} approval committed; ${lane === 'Commercial' ? 'Finance' : 'Commercial'} approval remains outstanding.`
    case 'approved':
      return `${lane} approval committed; the Project Budget baseline is now fully approved.`
    case 'rejected':
      return `${lane} approval recorded; this revision is now rejected.`
    case 'superseded':
      return `${lane} approval recorded; this revision is now superseded.`
    case 'draft':
      return `${lane} approval could not be confirmed for a draft result.`
  }
}

export function withRefreshOutcome(
  message: string,
  refreshWarning: string | undefined,
  refreshFailed: boolean
): string {
  const additions = [
    refreshWarning ? `Refresh warning: ${refreshWarning}` : null,
    refreshFailed
      ? 'The workflow committed, but the page could not refresh. Reload to view the latest state.'
      : null,
  ].filter((value): value is string => value !== null)

  return additions.length > 0 ? `${message} ${additions.join(' ')}` : message
}

export function nextBudgetWorkflowRequestId(): string {
  return crypto.randomUUID()
}
