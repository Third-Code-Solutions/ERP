import 'server-only'

import { randomUUID } from 'node:crypto'
import {
  rfqCreationResultSchema,
  rfqDispatchResultSchema,
  projectUpdateResultSchema,
  rfqQuoteResultSchema,
  rfqTransitionResultSchema,
  purchaseOrderCreationResultSchema,
  purchaseOrderWorkflowResultSchema,
  changeRequestCreationResultSchema,
  journalPostResultSchema,
  documentProcessingAcceptedSchema,
  documentProcessingStatusSchema,
  stockReceiptCreationResultSchema,
  type CreateRfqCommand,
  type CreateStockReceiptCommand,
  type LogRfqQuoteCommand,
  type CreatePurchaseOrderCommand,
  type ProjectUpdateResult,
  type RfqCreationResult,
  type RfqDispatchResult,
  type RfqQuoteResult,
  type RfqTransitionResult,
  type PurchaseOrderCreationResult,
  type PurchaseOrderWorkflowCommand,
  type PurchaseOrderWorkflowResult,
  type TransitionRfqCommand,
  type UpdateProjectCommand,
  type CreateChangeRequestCommand,
  type ChangeRequestCreationResult,
  type JournalPostResult,
  type DocumentProcessingAccepted,
  type DocumentProcessingRequest,
  type DocumentProcessingStatus,
  type StockReceiptCreationResult,
} from '@third-code-erp/shared-types'
import { createSupabaseServerClient } from '@third-code-erp/auth'

interface CoreResult<T> {
  ok: boolean
  data?: T
  error?: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function tenantEnabledForCoreApi(
  tenantId: string,
  enabled: string | undefined,
  tenantIds: string | undefined
): boolean {
  if (enabled !== 'true') return false
  const normalizedTenantId = tenantId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalizedTenantId)) return false

  const allowlist = (tenantIds ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  if (allowlist.length === 0) return false
  if (
    allowlist.some(
      (entry) => entry !== '*' && !UUID_PATTERN.test(entry)
    )
  ) {
    return false
  }
  if (allowlist.includes('*')) return allowlist.length === 1

  return allowlist.includes(normalizedTenantId)
}

export function projectWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PROJECT_WRITES_VIA_API,
    process.env.ERP_PROJECT_WRITES_VIA_API_TENANT_IDS
  )
}

export function rfqQuoteWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_RFQ_QUOTE_WRITES_VIA_API,
    process.env.ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS
  )
}

export function rfqCreateWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_RFQ_CREATE_WRITES_VIA_API,
    process.env.ERP_RFQ_CREATE_WRITES_VIA_API_TENANT_IDS
  )
}

export function rfqAutoDispatchUsesCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_RFQ_AUTO_DISPATCH_VIA_API,
    process.env.ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS
  )
}

export function rfqTerminalWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_RFQ_TERMINAL_WRITES_VIA_API,
    process.env.ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS
  )
}

export function purchaseOrderWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PO_CREATE_WRITES_VIA_API,
    process.env.ERP_PO_CREATE_WRITES_VIA_API_TENANT_IDS
  )
}

export function purchaseOrderWorkflowWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PO_WORKFLOW_WRITES_VIA_API,
    process.env.ERP_PO_WORKFLOW_WRITES_VIA_API_TENANT_IDS
  )
}

export function changeRequestWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_CHANGE_REQUEST_WRITES_VIA_API,
    process.env.ERP_CHANGE_REQUEST_WRITES_VIA_API_TENANT_IDS
  )
}

export function financeJournalPostWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API,
    process.env.ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API_TENANT_IDS
  )
}

export function stockReceiptCreateWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_RECEIPT_CREATE_VIA_API,
    process.env.ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS
  )
}

/**
 * Binary-CAD processing is delegated only for an explicit tenant canary.
 * The Nest service owns the worker bridge, evidence commit, and draft-BOM
 * gates; this client flag only selects the authority boundary in Next.
 */
export function documentProcessingJobsUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DOCUMENT_PROCESSING_VIA_API,
    process.env.ERP_DOCUMENT_PROCESSING_TENANT_IDS
  )
}

async function getCoreApiAccess(): Promise<
  | { ok: true; baseUrl: string; accessToken: string }
  | { ok: false; error: string }
> {
  const baseUrl = process.env.ERP_CORE_API_URL?.replace(/\/+$/, '')
  if (!baseUrl) {
    return {
      ok: false,
      error: 'ERP Core API is not configured.',
    }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, error: 'Unauthorized' }
  }

  return {
    ok: true,
    baseUrl,
    accessToken: session.access_token,
  }
}

export async function updateProjectThroughCoreApi(
  projectId: string,
  command: UpdateProjectCommand
): Promise<CoreResult<ProjectUpdateResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${projectId}`,
      {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Project changed after this form was opened.'
            : 'Project update was not committed.'
      return { ok: false, error: message }
    }

    const parsed = projectUpdateResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Project result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No Project change was committed.',
    }
  }
}

export async function createRfqThroughCoreApi(
  command: CreateRfqCommand
): Promise<CoreResult<RfqCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/rfqs`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'RFQ creation conflicts with the BOM state.'
            : response.status === 404
              ? 'BOM was not found.'
              : 'RFQ was not created.'
      return { ok: false, error: message }
    }

    const parsed = rfqCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid RFQ creation result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No RFQ was created.',
    }
  }
}

export async function createPurchaseOrderThroughCoreApi(
  command: CreatePurchaseOrderCommand,
  idempotencyKey: string
): Promise<CoreResult<PurchaseOrderCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/purchase-orders`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Purchase Order request conflicts with an existing command.'
            : 'Purchase Order was not committed.'
      return { ok: false, error: message }
    }

    const parsed = purchaseOrderCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Purchase Order result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No Purchase Order was committed.',
    }
  }
}

export async function createStockReceiptThroughCoreApi(
  command: CreateStockReceiptCommand,
  idempotencyKey: string
): Promise<CoreResult<StockReceiptCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/stock-receipts`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Stock Receipt conflicts with existing inventory evidence.'
            : 'Stock Receipt was not committed.'
      return { ok: false, error: message }
    }

    const parsed = stockReceiptCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Stock Receipt result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No Stock Receipt was committed.',
    }
  }
}

/**
 * Server-only contract seam for approval transitions. The current Server
 * Actions remain authoritative until notification parity and a canary exist.
 */
export async function transitionPurchaseOrderThroughCoreApi(
  purchaseOrderId: string,
  command: PurchaseOrderWorkflowCommand,
  idempotencyKey: string
): Promise<CoreResult<PurchaseOrderWorkflowResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/purchase-orders/${encodeURIComponent(
        purchaseOrderId
      )}/workflow`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Purchase Order workflow conflicts with its current state.'
            : response.status === 404
              ? 'Purchase Order was not found.'
              : 'Purchase Order workflow was not committed.'
      return { ok: false, error: message }
    }

    const parsed = purchaseOrderWorkflowResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Purchase Order workflow result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No Purchase Order workflow was committed.',
    }
  }
}

export async function dispatchApprovedBomRfqThroughCoreApi(
  command: CreateRfqCommand
): Promise<CoreResult<RfqDispatchResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/rfqs/dispatch`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : 'RFQ dispatch was not queued.'
      return { ok: false, error: message }
    }

    const parsed = rfqDispatchResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid RFQ dispatch result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. RFQ dispatch was not queued.',
    }
  }
}

export async function logRfqQuoteThroughCoreApi(
  rfqId: string,
  command: LogRfqQuoteCommand
): Promise<CoreResult<RfqQuoteResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/rfqs/${rfqId}/quotes`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Quote submission conflicts with an existing record.'
            : response.status === 404
              ? 'RFQ, line, or vendor was not found.'
              : 'Quote was not committed.'
      return { ok: false, error: message }
    }

    const parsed = rfqQuoteResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid RFQ quote result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No quote was committed.',
    }
  }
}

export async function transitionRfqThroughCoreApi(
  rfqId: string,
  command: TransitionRfqCommand
): Promise<CoreResult<RfqTransitionResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/rfqs/${rfqId}/transitions`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'RFQ transition conflicts with its current state.'
            : response.status === 404
              ? 'RFQ was not found.'
              : 'RFQ transition was not committed.'
      return { ok: false, error: message }
    }

    const parsed = rfqTransitionResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid RFQ transition result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No RFQ transition was committed.',
    }
  }
}

/**
 * Server-only contract seam for Client Change Requests. The current Server
 * Action remains authoritative while the closed gate is validated in a
 * tenant-scoped canary.
 */
export async function createChangeRequestThroughCoreApi(
  opportunityId: string,
  command: CreateChangeRequestCommand,
  idempotencyKey: string
): Promise<CoreResult<ChangeRequestCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/crm/opportunities/${encodeURIComponent(
        opportunityId
      )}/change-requests`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Change Request conflicts with an existing command.'
            : response.status === 404
              ? 'Opportunity or design file was not found.'
              : 'Change Request was not committed.'
      return { ok: false, error: message }
    }

    const parsed = changeRequestCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Change Request result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No Change Request was committed.',
    }
  }
}

export type DocumentProcessingCoreResult =
  | DocumentProcessingAccepted
  | DocumentProcessingStatus

function parseDocumentProcessingResult(
  body: unknown
): DocumentProcessingCoreResult | null {
  const accepted = documentProcessingAcceptedSchema.safeParse(body)
  if (accepted.success) return accepted.data
  const status = documentProcessingStatusSchema.safeParse(body)
  return status.success ? status.data : null
}

export async function enqueueDocumentProcessingThroughCoreApi(
  documentId: string,
  request: DocumentProcessingRequest,
  idempotencyKey: string
): Promise<CoreResult<DocumentProcessingCoreResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/documents/${encodeURIComponent(
        documentId
      )}/processing-jobs`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(request),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      const detail =
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Document processing conflicts with an existing command.'
            : response.status === 404
              ? 'Document was not found.'
              : 'Document processing was not queued.'
      return { ok: false, error: detail }
    }

    const parsed = parseDocumentProcessingResult(body)
    if (!parsed) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid document processing result.',
      }
    }
    return { ok: true, data: parsed }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No document processing job was created.',
    }
  }
}

export async function getDocumentProcessingStatusThroughCoreApi(
  jobId: string
): Promise<CoreResult<DocumentProcessingStatus>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/document-processing-jobs/${encodeURIComponent(
        jobId
      )}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'x-request-id': randomUUID(),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )
    const body = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      const detail =
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
          ? body.message
          : response.status === 404
            ? 'Document processing job was not found.'
            : 'Document processing status is unavailable.'
      return { ok: false, error: detail }
    }
    const parsed = documentProcessingStatusSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid document processing status.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Processing status is unavailable.',
    }
  }
}

export async function postJournalEntryThroughCoreApi(
  journalEntryId: string,
  idempotencyKey: string
): Promise<CoreResult<JournalPostResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/journals/${encodeURIComponent(
        journalEntryId
      )}/post`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify({ journalEntryId }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Journal posting conflicts with its current state.'
            : response.status === 404
              ? 'Journal entry was not found.'
              : 'Journal entry was not posted.'
      return { ok: false, error: message }
    }

    const parsed = journalPostResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid journal posting result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No journal was posted.',
    }
  }
}
