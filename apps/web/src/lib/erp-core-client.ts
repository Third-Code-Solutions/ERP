import 'server-only'

import { randomUUID } from 'node:crypto'
import {
  rfqCreationResultSchema,
  rfqDispatchResultSchema,
  projectUpdateResultSchema,
  projectReadResultSchema,
  projectListResultSchema,
  accountListResultSchema,
  accountKycQueueResultSchema,
  accountDetailResultSchema,
  opportunityDetailResultSchema,
  rfqQuoteResultSchema,
  rfqTransitionResultSchema,
  projectCreationResultSchema,
  purchaseOrderCreationResultSchema,
  purchaseOrderBomCreationResultSchema,
  purchaseOrdersGroupedFromBomResultSchema,
  purchaseOrderWorkflowResultSchema,
  changeRequestCreationResultSchema,
  journalPostResultSchema,
  journalReverseResultSchema,
  supplierBillPostResultSchema,
  supplierBillReverseResultSchema,
  cashTransactionPostResultSchema,
  cashTransactionReverseResultSchema,
  cashTransactionDraftResultSchema,
  cashTransactionDraftDeleteResultSchema,
  customerInvoiceIssueResultSchema,
  customerInvoiceReverseResultSchema,
  customerInvoiceCancelResultSchema,
  documentDeleteResultSchema,
  publicSigningResultSchema,
  documentProcessingAcceptedSchema,
  documentProcessingStatusSchema,
  inventoryUomCreationResultSchema,
  inventoryWarehouseCreationResultSchema,
  inventoryWarehouseCloseoutResultSchema,
  inventoryWarehouseUpdateResultSchema,
  inventoryItemConfigurationResultSchema,
  inventorySummaryResultSchema,
  inventoryStockMovementListResultSchema,
  inventoryStockMovementDetailResultSchema,
  auditActivityResultSchema,
  financeLedgerResultSchema,
  financeReceivablesResultSchema,
  financePayablesResultSchema,
  stockMovementCreationResultSchema,
  stockMovementPostingResultSchema,
  stockMovementReversalResultSchema,
  stockReceiptCreationResultSchema,
  stockReceiptPostingResultSchema,
  stockReceiptReversalResultSchema,
  deliveryReceiptResultSchema,
  deliveryStartSitePreparationResultSchema,
  deliveryCompleteSitePreparationResultSchema,
  deliveryStartInspectionResultSchema,
  deliveryInspectionCompleteResultSchema,
  deliveryCancelResultSchema,
  type CreateRfqCommand,
  type CreateStockReceiptCommand,
  type LogRfqQuoteCommand,
  type CreatePurchaseOrderCommand,
  type CreatePurchaseOrderFromBomCommand,
  type ProjectUpdateResult,
  type ProjectReadResult,
  type ProjectListQuery,
  type ProjectListResult,
  type AccountListQuery,
  type AccountListResult,
  type AccountKycQueueResult,
  type AccountDetailResult,
  type OpportunityDetailResult,
  type CreateProjectCommand,
  type ProjectCreationResult,
  type RfqCreationResult,
  type RfqDispatchResult,
  type RfqQuoteResult,
  type RfqTransitionResult,
  type PurchaseOrderCreationResult,
  type PurchaseOrderBomCreationResult,
  type CreatePurchaseOrdersGroupedFromBomCommand,
  type PurchaseOrdersGroupedFromBomResult,
  type PurchaseOrderWorkflowCommand,
  type PurchaseOrderWorkflowResult,
  type TransitionRfqCommand,
  type UpdateProjectCommand,
  type CreateChangeRequestCommand,
  type ChangeRequestCreationResult,
  type JournalPostResult,
  type JournalReverseBody,
  type JournalReverseResult,
  type SupplierBillPostCommand,
  type SupplierBillPostResult,
  type SupplierBillReverseBody,
  type SupplierBillReverseResult,
  type CashTransactionPostBody,
  type CashTransactionPostResult,
  type CashTransactionReverseBody,
  type CashTransactionReverseResult,
  type CashTransactionDraftBody,
  type CashTransactionDraftResult,
  type CashTransactionDraftDeleteResult,
  type CustomerInvoiceIssueCommand,
  type CustomerInvoiceIssueResult,
  type CustomerInvoiceReverseBody,
  type CustomerInvoiceReverseResult,
  type CustomerInvoiceCancelBody,
  type CustomerInvoiceCancelResult,
  type DocumentDeleteResult,
  type PublicSigningBody,
  type PublicSigningResult,
  type DocumentProcessingAccepted,
  type DocumentProcessingRequest,
  type DocumentProcessingStatus,
  type InventorySummaryResult,
  type InventoryStockMovementListResult,
  type InventoryStockMovementDetailResult,
  type AuditActivityQuery,
  type AuditActivityResult,
  type FinanceLedgerQuery,
  type FinanceLedgerResult,
  type FinanceReceivablesQuery,
  type FinanceReceivablesResult,
  type FinancePayablesQuery,
  type FinancePayablesResult,
  type CreateStockMovementCommand,
  type StockMovementCreationResult,
  type StockMovementPostCommand,
  type StockMovementPostingResult,
  type StockMovementReverseCommand,
  type StockMovementReversalResult,
  type CreateInventoryUomCommand,
  type InventoryUomCreationResult,
  type CreateInventoryWarehouseCommand,
  type InventoryWarehouseCreationResult,
  type InventoryWarehouseCloseoutResult,
  type InventoryWarehouseUpdateResult,
  type UpdateInventoryWarehouseCommand,
  type ConfigureInventoryItemCommand,
  type InventoryItemConfigurationResult,
  type StockReceiptCreationResult,
  type StockReceiptPostCommand,
  type StockReceiptPostingResult,
  type StockReceiptReverseCommand,
  type StockReceiptReversalResult,
  type DeliveryReceiptCommand,
  type DeliveryReceiptResult,
  type DeliveryStartSitePreparationCommand,
  type DeliveryStartSitePreparationResult,
  type DeliveryCompleteSitePreparationCommand,
  type DeliveryCompleteSitePreparationResult,
  type DeliveryStartInspectionCommand,
  type DeliveryStartInspectionResult,
  type DeliveryInspectionCompleteCommand,
  type DeliveryInspectionCompleteResult,
  type DeliveryCancelCommand,
  type DeliveryCancelResult,
  type CreateCostEntryCommand,
  costEntryCreationResultSchema,
  type CostEntryCreationResult,
  cortexSearchResultSchema,
  type CortexSearchResult,
} from '@third-code-erp/shared-types'
import { createSupabaseServerClient } from '@third-code-erp/auth'
import { z } from 'zod'

interface CoreResult<T> {
  ok: boolean
  data?: T
  error?: string
  status?: number
}

export type ProviderQuotaBucket =
  | 'provider-chat'
  | 'provider-embedding'

export interface ProviderQuotaDecision {
  allowed: boolean
  bucket: ProviderQuotaBucket
  count: number
  limit: number
  retryAfterSeconds: number
  scope: 'tenant-user'
}

const providerQuotaDecisionSchema = z.object({
  allowed: z.boolean(),
  bucket: z.enum(['provider-chat', 'provider-embedding']),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  retryAfterSeconds: z.number().int().nonnegative(),
  scope: z.literal('tenant-user'),
})

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function tenantEnabledForCoreApi(
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

export function projectReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PROJECT_READS_VIA_API,
    process.env.ERP_PROJECT_READS_VIA_API_TENANT_IDS
  )
}

export function projectListsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PROJECT_LISTS_VIA_API,
    process.env.ERP_PROJECT_LISTS_VIA_API_TENANT_IDS
  )
}

export function accountReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_ACCOUNT_READS_VIA_API,
    process.env.ERP_ACCOUNT_READS_VIA_API_TENANT_IDS
  )
}

export function accountKycQueueReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API,
    process.env.ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API_TENANT_IDS
  )
}

export function opportunityReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_OPPORTUNITY_READS_VIA_API,
    process.env.ERP_OPPORTUNITY_READS_VIA_API_TENANT_IDS
  )
}

export function auditActivityReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_AUDIT_ACTIVITY_READS_VIA_API,
    process.env.ERP_AUDIT_ACTIVITY_READS_VIA_API_TENANT_IDS
  )
}

export function inventorySummaryReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_SUMMARY_READS_VIA_API,
    process.env.ERP_INVENTORY_SUMMARY_READS_VIA_API_TENANT_IDS
  )
}

/** Cortex search authority remains disabled until a tenant-scoped canary is approved. */
export function cortexSearchUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_CORTEX_SEARCH_VIA_API,
    process.env.ERP_CORTEX_SEARCH_VIA_API_TENANT_IDS
  )
}

/** General-ledger reads remain disabled until a protected finance canary is approved. */
export function financeLedgerReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_LEDGER_READS_VIA_API,
    process.env.ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS
  )
}

/** Customer receivables reads remain disabled until a protected finance canary is approved. */
export function financeReceivablesReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_RECEIVABLES_READS_VIA_API,
    process.env.ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS
  )
}

/** Supplier payables reads remain disabled until a protected finance canary is approved. */
export function financePayablesReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_PAYABLES_READS_VIA_API,
    process.env.ERP_FINANCE_PAYABLES_READS_VIA_API_TENANT_IDS
  )
}

export function inventoryItemConfigurationWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_ITEM_CONFIG_VIA_API,
    process.env.ERP_INVENTORY_ITEM_CONFIG_TENANT_IDS
  )
}

export function inventoryUomCreateWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_UOM_CREATE_VIA_API,
    process.env.ERP_INVENTORY_UOM_CREATE_TENANT_IDS
  )
}

export function inventoryWarehouseCreateWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_WAREHOUSE_CREATE_VIA_API,
    process.env.ERP_INVENTORY_WAREHOUSE_CREATE_TENANT_IDS
  )
}

export function inventoryWarehouseUpdateWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_WAREHOUSE_UPDATE_VIA_API,
    process.env.ERP_INVENTORY_WAREHOUSE_UPDATE_TENANT_IDS
  )
}

export function inventoryWarehouseCloseoutReadsUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_WAREHOUSE_CLOSEOUT_READS_VIA_API,
    process.env.ERP_INVENTORY_WAREHOUSE_CLOSEOUT_READS_TENANT_IDS
  )
}

export function inventoryStockMovementReadsUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API,
    process.env.ERP_INVENTORY_STOCK_MOVEMENT_READS_TENANT_IDS
  )
}

export function inventoryStockMovementDetailReadsUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API,
    process.env.ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_TENANT_IDS
  )
}

export function inventoryStockMovementCreateWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API,
    process.env.ERP_INVENTORY_STOCK_MOVEMENT_CREATE_TENANT_IDS
  )
}

export function inventoryStockMovementWorkflowUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API,
    process.env.ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_TENANT_IDS
  )
}

export function projectCreateWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PROJECT_CREATE_WRITES_VIA_API,
    process.env.ERP_PROJECT_CREATE_WRITES_VIA_API_TENANT_IDS
  )
}

export function costEntryCreateWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_COST_ENTRY_CREATE_WRITES_VIA_API,
    process.env.ERP_COST_ENTRY_CREATE_WRITES_VIA_API_TENANT_IDS
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

export function purchaseOrderBomWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PO_BOM_CREATE_WRITES_VIA_API,
    process.env.ERP_PO_BOM_CREATE_WRITES_VIA_API_TENANT_IDS
  )
}

export function purchaseOrderBomGroupedWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API,
    process.env.ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API_TENANT_IDS
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

export function financeJournalReverseWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API,
    process.env.ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API_TENANT_IDS
  )
}

export function financeSupplierBillPostWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API,
    process.env.ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API_TENANT_IDS
  )
}

export function financeSupplierBillReverseWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API,
    process.env.ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API_TENANT_IDS
  )
}

export function financeCashWorkflowWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API,
    process.env.ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API_TENANT_IDS
  )
}

export function financeCashDraftWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API,
    process.env.ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API_TENANT_IDS
  )
}

export function financeCustomerInvoiceIssueWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API,
    process.env.ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API_TENANT_IDS
  )
}

export function financeCustomerInvoiceReverseWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API,
    process.env.ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API_TENANT_IDS
  )
}

export function financeCustomerInvoiceCancelWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API,
    process.env.ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API_TENANT_IDS
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

export function stockReceiptPostWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_RECEIPT_POST_VIA_API,
    process.env.ERP_INVENTORY_RECEIPT_POST_TENANT_IDS
  )
}

export function stockReceiptReverseWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_RECEIPT_REVERSE_VIA_API,
    process.env.ERP_INVENTORY_RECEIPT_REVERSE_TENANT_IDS
  )
}

export function deliveryReceiptWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DELIVERY_RECEIPT_WRITES_VIA_API,
    process.env.ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS
  )
}

export function deliverySitePreparationStartWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API,
    process.env.ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API_TENANT_IDS
  )
}

export function deliverySitePreparationCompleteWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API,
    process.env.ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API_TENANT_IDS
  )
}

export function deliveryInspectionStartWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API,
    process.env.ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API_TENANT_IDS
  )
}

export function deliveryInspectionCompleteWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API,
    process.env.ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API_TENANT_IDS
  )
}

export function deliveryCancelWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DELIVERY_CANCEL_WRITES_VIA_API,
    process.env.ERP_DELIVERY_CANCEL_WRITES_VIA_API_TENANT_IDS
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

/**
 * Document deletion is delegated only for an explicit tenant canary. The
 * Nest transaction is authoritative; a failed Core call never falls back to
 * the legacy Server Action mutation.
 */
export function documentDeleteWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DOCUMENT_DELETE_WRITES_VIA_API,
    process.env.ERP_DOCUMENT_DELETE_WRITES_VIA_API_TENANT_IDS
  )
}

/** Public token signing is delegated only for an explicit tenant canary. */
export function publicSigningWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PUBLIC_SIGNING_VIA_API,
    process.env.ERP_PUBLIC_SIGNING_VIA_API_TENANT_IDS
  )
}

function getCoreApiBaseUrl(): string | null {
  const baseUrl = process.env.ERP_CORE_API_URL?.replace(/\/+$/, '')
  return baseUrl || null
}

export async function getCoreApiAccess(): Promise<
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

/**
 * Read-only Cortex adapter. When enabled, a failed core response is returned
 * to the caller; the legacy direct database route must not silently regain
 * authority for the canary tenant.
 */
export async function searchCortexThroughCoreApi(
  query: string,
  limit = 20
): Promise<CoreResult<CortexSearchResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'x-request-id': randomUUID(),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      }
    )
    const rawBody: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const body = rawBody as { message?: unknown } | null
      return {
        ok: false,
        status: response.status,
        error:
          typeof body?.message === 'string'
            ? body.message
            : 'Cortex search service is unavailable.',
      }
    }

    const parsed = cortexSearchResultSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid Cortex search result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex search service is unavailable.',
    }
  }
}

export function providerQuotaUsesCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PROVIDER_QUOTA_VIA_API,
    process.env.ERP_PROVIDER_QUOTA_VIA_API_TENANT_IDS
  )
}

export type ProviderQuotaAttempt =
  | { ok: true; skipped: boolean; data?: ProviderQuotaDecision }
  | {
      ok: false
      status: 429 | 503
      error: string
      retryAfterSeconds?: number
      limit?: number
      scope?: string
    }

/**
 * Consume shared provider budget through authenticated NestJS API. Feature
 * flag stays tenant-scoped and fail-closed: if enabled but API unavailable,
 * caller must not spend external provider credits.
 */
export async function consumeProviderQuotaViaCoreApi(
  bucket: ProviderQuotaBucket,
  tenantId: string
): Promise<ProviderQuotaAttempt> {
  if (!providerQuotaUsesCoreApi(tenantId)) {
    return { ok: true, skipped: true }
  }

  const access = await getCoreApiAccess()
  if (!access.ok) {
    return {
      ok: false,
      status: 503,
      error: 'Provider quota service is not configured.',
    }
  }

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/provider-quotas/consume`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify({ bucket }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      }
    )
    const rawBody: unknown = await response.json().catch(() => null)
    const parsed = providerQuotaDecisionSchema.safeParse(rawBody)
    if (parsed.success) {
      if (parsed.data.allowed) {
        return { ok: true, skipped: false, data: parsed.data }
      }
      return {
        ok: false,
        status: 429,
        error: 'Provider request limit reached. Try again shortly.',
        retryAfterSeconds: parsed.data.retryAfterSeconds,
        limit: parsed.data.limit,
        scope: parsed.data.scope,
      }
    }

    return {
      ok: false,
      status: response.status === 429 ? 429 : 503,
      error:
        response.status === 429
          ? 'Provider request limit reached. Try again shortly.'
          : 'Provider quota service is unavailable.',
      retryAfterSeconds:
        response.status === 429
          ? Number(response.headers.get('retry-after') ?? 60)
          : undefined,
      limit:
        response.status === 429
          ? Number(response.headers.get('x-ratelimit-limit') ?? 0) || undefined
          : undefined,
      scope: response.headers.get('x-ratelimit-scope') ?? undefined,
    }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Provider quota service is unavailable.',
    }
  }
}

export async function deleteDocumentThroughCoreApi(
  documentId: string,
  idempotencyKey: string
): Promise<CoreResult<DocumentDeleteResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/documents/${encodeURIComponent(documentId)}`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify({}),
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
          : response.status === 404
            ? 'Document not found.'
            : response.status === 409
              ? 'Document cannot be deleted in its current state.'
              : 'Document was not deleted.'
      return { ok: false, error: message }
    }

    const parsed = documentDeleteResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid document deletion result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No document was deleted.',
    }
  }
}

export async function signPublicSignatureThroughCoreApi(
  token: string,
  body: PublicSigningBody,
  idempotencyKey: string
): Promise<CoreResult<PublicSigningResult>> {
  const baseUrl = getCoreApiBaseUrl()
  if (!baseUrl) {
    return { ok: false, error: 'ERP Core API is not configured.' }
  }

  try {
    const response = await fetch(
      `${baseUrl}/v1/public/signatures/${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      }
    )
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof payload?.message === 'string'
          ? payload.message
          : response.status === 404
            ? 'Invalid signing link.'
            : response.status === 409
              ? 'This signing link is no longer available.'
              : 'Could not record signature. Try again.'
      return { ok: false, error: message }
    }
    const parsed = publicSigningResultSchema.safeParse(payload)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid signature result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No signature was recorded.',
    }
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

export async function getProjectThroughCoreApi(
  projectId: string
): Promise<CoreResult<ProjectReadResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${encodeURIComponent(projectId)}`,
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

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 404
            ? 'Project not found.'
            : 'Project read was not completed.',
      }
    }

    const parsed = projectReadResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Project read result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Project data was not read.',
    }
  }
}

export async function getAuditActivityThroughCoreApi(
  query: AuditActivityQuery
): Promise<CoreResult<AuditActivityResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams()
    if (query.entityType) params.set('entityType', query.entityType)
    if (query.action) params.set('action', query.action)
    for (const entityId of query.entityIds ?? []) {
      params.append('entityIds', entityId)
    }
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))

    const response = await fetch(
      `${access.baseUrl}/v1/audit/activity?${params.toString()}`,
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

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 400
            ? 'Audit activity filters are invalid.'
            : response.status === 403
              ? 'You do not have permission to view audit activity.'
              : 'Audit activity was not completed.',
      }
    }

    const parsed = auditActivityResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid audit activity result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Audit activity was not read.',
    }
  }
}

export async function getFinanceLedgerThroughCoreApi(
  query: FinanceLedgerQuery
): Promise<CoreResult<FinanceLedgerResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams()
    if (query.accountId) params.set('accountId', query.accountId)
    if (query.customerId) params.set('customerId', query.customerId)
    if (query.vendorId) params.set('vendorId', query.vendorId)
    if (query.projectId) params.set('projectId', query.projectId)
    if (query.from) params.set('from', query.from)
    if (query.to) params.set('to', query.to)
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))

    const response = await fetch(
      `${access.baseUrl}/v1/finance/ledger?${params.toString()}`,
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
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 400
            ? 'Finance ledger filters are invalid.'
            : response.status === 403
              ? 'You do not have permission to view the general ledger.'
              : 'Finance ledger was not completed.',
        status: response.status,
      }
    }

    const parsed = financeLedgerResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid finance ledger result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Finance ledger was not read.',
    }
  }
}

export async function getFinanceReceivablesThroughCoreApi(
  query: FinanceReceivablesQuery
): Promise<CoreResult<FinanceReceivablesResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams()
    if (query.accountId) params.set('accountId', query.accountId)
    if (query.projectId) params.set('projectId', query.projectId)
    if (query.status) params.set('status', query.status)
    if (query.dueFrom) params.set('dueFrom', query.dueFrom)
    if (query.dueTo) params.set('dueTo', query.dueTo)
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))

    const response = await fetch(
      `${access.baseUrl}/v1/finance/receivables?${params.toString()}`,
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
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 400
            ? 'Customer receivables filters are invalid.'
            : response.status === 403
              ? 'You do not have permission to view customer receivables.'
              : 'Customer receivables were not completed.',
        status: response.status,
      }
    }

    const parsed = financeReceivablesResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid customer receivables result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Customer receivables were not read.',
    }
  }
}

export async function getFinancePayablesThroughCoreApi(
  query: FinancePayablesQuery
): Promise<CoreResult<FinancePayablesResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams()
    if (query.vendorId) params.set('vendorId', query.vendorId)
    if (query.projectId) params.set('projectId', query.projectId)
    if (query.status) params.set('status', query.status)
    if (query.dueFrom) params.set('dueFrom', query.dueFrom)
    if (query.dueTo) params.set('dueTo', query.dueTo)
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))

    const response = await fetch(
      `${access.baseUrl}/v1/finance/payables?${params.toString()}`,
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
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 400
            ? 'Supplier payables filters are invalid.'
            : response.status === 403
              ? 'You do not have permission to view supplier payables.'
              : 'Supplier payables were not completed.',
        status: response.status,
      }
    }

    const parsed = financePayablesResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid supplier payables result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Supplier payables were not read.',
    }
  }
}

export async function getProjectsThroughCoreApi(
  query: ProjectListQuery
): Promise<CoreResult<ProjectListResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams()
    if (query.q) params.set('q', query.q)
    if (query.status) params.set('status', query.status)
    if (query.projectType) params.set('projectType', query.projectType)
    params.set('sort', query.sort)
    params.set('order', query.order)
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))
    const response = await fetch(
      `${access.baseUrl}/v1/projects?${params.toString()}`,
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

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 400
            ? 'Project list filters are invalid.'
            : 'Project list was not completed.',
      }
    }

    const parsed = projectListResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Project list result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Project list was not read.',
    }
  }
}

export async function getAccountsThroughCoreApi(
  query: AccountListQuery
): Promise<CoreResult<AccountListResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams()
    if (query.q) params.set('q', query.q)
    if (query.industry) params.set('industry', query.industry)
    if (query.kycStatus) params.set('kycStatus', query.kycStatus)
    params.set('sort', query.sort)
    params.set('order', query.order)
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))
    const response = await fetch(
      `${access.baseUrl}/v1/crm/accounts?${params.toString()}`,
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

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 400
            ? 'Account list filters are invalid.'
            : 'Account list was not completed.',
      }
    }

    const parsed = accountListResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Account list result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Account list was not read.',
    }
  }
}

export async function getKycQueueThroughCoreApi(): Promise<
  CoreResult<AccountKycQueueResult>
> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/crm/accounts/kyc-queue`,
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

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error: 'KYC queue was not completed.',
      }
    }

    const parsed = accountKycQueueResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid KYC queue result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. KYC queue was not read.',
    }
  }
}

export async function getAccountThroughCoreApi(
  accountId: string
): Promise<CoreResult<AccountDetailResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/crm/accounts/${encodeURIComponent(accountId)}`,
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

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 404
            ? 'Account not found.'
            : 'Account detail was not completed.',
      }
    }

    const parsed = accountDetailResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Account detail result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Account detail was not read.',
    }
  }
}

export async function getInventorySummaryThroughCoreApi(): Promise<
  CoreResult<InventorySummaryResult>
> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(`${access.baseUrl}/v1/inventory/summary`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        'x-request-id': randomUUID(),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error: 'Inventory summary was not completed.',
      }
    }

    const parsed = inventorySummaryResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid inventory summary result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Inventory was not read.',
    }
  }
}

export async function getInventoryStockMovementsThroughCoreApi(
  query: { movementType?: string; status?: string; page?: number; limit?: number } = {}
): Promise<CoreResult<InventoryStockMovementListResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams()
    if (query.movementType) params.set('movementType', query.movementType)
    if (query.status) params.set('status', query.status)
    if (query.page) params.set('page', String(query.page))
    if (query.limit) params.set('limit', String(query.limit))
    const suffix = params.toString()
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/stock-movements${suffix ? `?${suffix}` : ''}`,
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
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error: 'Inventory Stock Movement register was not read.',
      }
    }
    const parsed = inventoryStockMovementListResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid Stock Movement register result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. Stock Movement register was not read.',
    }
  }
}

export async function getInventoryStockMovementDetailThroughCoreApi(
  movementId: string
): Promise<CoreResult<InventoryStockMovementDetailResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/stock-movements/${encodeURIComponent(
        movementId
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
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error:
          response.status === 404
            ? 'Stock Movement was not found.'
            : 'Inventory Stock Movement detail was not read.',
      }
    }
    const parsed = inventoryStockMovementDetailResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        status: response.status,
        error:
          'ERP Core API returned an invalid Stock Movement detail result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. Stock Movement detail was not read.',
    }
  }
}

export async function createStockMovementThroughCoreApi(
  command: CreateStockMovementCommand,
  idempotencyKey: string
): Promise<CoreResult<StockMovementCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/stock-movements`,
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
            ? 'Stock Movement conflicts with existing inventory evidence.'
            : 'Stock Movement was not committed.'
      return { ok: false, error: message }
    }
    const parsed = stockMovementCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Stock Movement result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No Stock Movement was committed.',
    }
  }
}

export async function postStockMovementThroughCoreApi(
  movementId: string,
  command: StockMovementPostCommand,
  idempotencyKey: string
): Promise<CoreResult<StockMovementPostingResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/stock-movements/${encodeURIComponent(
        movementId
      )}/post`,
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
            ? 'Stock Movement posting conflicts with its current state.'
            : response.status === 404
              ? 'Stock Movement was not found.'
              : 'Stock Movement was not posted.'
      return { ok: false, error: message, status: response.status }
    }
    const parsed = stockMovementPostingResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Stock Movement posting result.',
        status: response.status,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No Stock Movement was posted.',
    }
  }
}

export async function reverseStockMovementThroughCoreApi(
  movementId: string,
  command: StockMovementReverseCommand,
  idempotencyKey: string
): Promise<CoreResult<StockMovementReversalResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/stock-movements/${encodeURIComponent(
        movementId
      )}/reverse`,
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
            ? 'Stock Movement reversal conflicts with its current state.'
            : response.status === 404
              ? 'Stock Movement was not found.'
              : 'Stock Movement was not reversed.'
      return { ok: false, error: message, status: response.status }
    }
    const parsed = stockMovementReversalResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Stock Movement reversal result.',
        status: response.status,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No Stock Movement was reversed.',
    }
  }
}

export async function configureInventoryItemThroughCoreApi(
  materialItemId: string,
  command: ConfigureInventoryItemCommand
): Promise<CoreResult<InventoryItemConfigurationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/items/${encodeURIComponent(
        materialItemId
      )}/configuration`,
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
            ? 'Inventory item configuration conflicts with posted stock evidence.'
            : response.status === 404
              ? 'Inventory item was not found.'
              : 'Inventory item configuration was not committed.'
      return { ok: false, error: message }
    }

    const parsed = inventoryItemConfigurationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid inventory item configuration result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No inventory item configuration was committed.',
    }
  }
}

export async function createInventoryUomThroughCoreApi(
  command: CreateInventoryUomCommand
): Promise<CoreResult<InventoryUomCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(`${access.baseUrl}/v1/inventory/uoms`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        'content-type': 'application/json',
        'x-request-id': randomUUID(),
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'That UOM code already exists.'
            : 'Inventory UOM was not created.'
      return { ok: false, error: message }
    }

    const parsed = inventoryUomCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid inventory UOM result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No inventory UOM was created.',
    }
  }
}

export async function createInventoryWarehouseThroughCoreApi(
  command: CreateInventoryWarehouseCommand
): Promise<CoreResult<InventoryWarehouseCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(`${access.baseUrl}/v1/inventory/warehouses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        'content-type': 'application/json',
        'x-request-id': randomUUID(),
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'That Warehouse code already exists.'
            : response.status === 404
              ? 'Project not found.'
              : 'Inventory Warehouse was not created.'
      return { ok: false, error: message }
    }

    const parsed = inventoryWarehouseCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid inventory Warehouse result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No inventory Warehouse was created.',
    }
  }
}

export async function updateInventoryWarehouseThroughCoreApi(
  warehouseId: string,
  command: UpdateInventoryWarehouseCommand
): Promise<CoreResult<InventoryWarehouseUpdateResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/warehouses/${encodeURIComponent(
        warehouseId
      )}`,
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
          : response.status === 404
            ? 'Warehouse not found.'
            : 'Inventory Warehouse was not updated.'
      return { ok: false, error: message }
    }

    const parsed = inventoryWarehouseUpdateResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid inventory Warehouse update result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No inventory Warehouse was updated.',
    }
  }
}

export async function getInventoryWarehouseCloseoutThroughCoreApi(
  warehouseId: string
): Promise<CoreResult<InventoryWarehouseCloseoutResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/warehouses/${encodeURIComponent(
        warehouseId
      )}/closeout`,
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

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          typeof body?.message === 'string'
            ? body.message
            : response.status === 404
              ? 'Warehouse not found.'
              : 'Inventory Warehouse closeout was not read.',
      }
    }

    const parsed = inventoryWarehouseCloseoutResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid inventory Warehouse closeout result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. Inventory Warehouse closeout was not read.',
    }
  }
}

export async function getOpportunityThroughCoreApi(
  opportunityId: string
): Promise<CoreResult<OpportunityDetailResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/crm/opportunities/${encodeURIComponent(
        opportunityId
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

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 404
            ? 'Opportunity not found.'
            : 'Opportunity detail was not completed.',
      }
    }

    const parsed = opportunityDetailResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Opportunity detail result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Opportunity detail was not read.',
    }
  }
}

export async function createProjectThroughCoreApi(
  command: CreateProjectCommand,
  idempotencyKey: string
): Promise<CoreResult<ProjectCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(`${access.baseUrl}/v1/projects`, {
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
    })

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 503
            ? 'Project creation is not enabled for this tenant.'
            : 'Project was not created.'
      return { ok: false, error: message }
    }

    const parsed = projectCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Project creation result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No Project was created.',
    }
  }
}

export async function createCostEntryThroughCoreApi(
  projectId: string,
  command: CreateCostEntryCommand,
  idempotencyKey: string
): Promise<CoreResult<CostEntryCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${encodeURIComponent(projectId)}/cost-entries`,
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
          : response.status === 503
            ? 'Cost entry creation is not enabled for this tenant.'
            : response.status === 409
              ? 'Cost entry conflicts with the selected Cost Code.'
              : 'Cost entry was not created.'
      return { ok: false, error: message }
    }

    const parsed = costEntryCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid cost entry result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No cost entry was created.',
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

export async function createPurchaseOrderFromBomThroughCoreApi(
  command: CreatePurchaseOrderFromBomCommand,
  idempotencyKey: string
): Promise<CoreResult<PurchaseOrderBomCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/purchase-orders/from-bom`,
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
            ? 'BOM Purchase Order request conflicts with the BOM state.'
            : response.status === 404
              ? 'BOM was not found.'
              : 'BOM Purchase Order was not committed.'
      return { ok: false, error: message }
    }

    const parsed = purchaseOrderBomCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid BOM Purchase Order result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No BOM Purchase Order was committed.',
    }
  }
}

export async function createPurchaseOrdersGroupedFromBomThroughCoreApi(
  command: CreatePurchaseOrdersGroupedFromBomCommand,
  idempotencyKey: string
): Promise<CoreResult<PurchaseOrdersGroupedFromBomResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/purchase-orders/from-bom/grouped`,
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
            ? 'Grouped BOM Purchase Order request conflicts with the BOM state.'
            : response.status === 404
              ? 'BOM was not found.'
              : 'Grouped BOM Purchase Orders were not committed.'
      return { ok: false, error: message }
    }

    const parsed = purchaseOrdersGroupedFromBomResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid grouped BOM Purchase Order result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No grouped BOM Purchase Orders were committed.',
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

export async function recordDeliveryReceiptThroughCoreApi(
  deliveryScheduleId: string,
  command: DeliveryReceiptCommand,
  idempotencyKey: string
): Promise<CoreResult<DeliveryReceiptResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/deliveries/${encodeURIComponent(
        deliveryScheduleId
      )}/receipt`,
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
            ? 'Delivery receipt conflicts with its current state.'
            : response.status === 404
              ? 'Delivery was not found.'
              : 'Delivery receipt was not committed.'
      return { ok: false, error: message }
    }
    const parsed = deliveryReceiptResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid delivery receipt result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No delivery receipt was committed.',
    }
  }
}

export async function startDeliverySitePreparationThroughCoreApi(
  deliveryScheduleId: string,
  command: DeliveryStartSitePreparationCommand,
  idempotencyKey: string
): Promise<CoreResult<DeliveryStartSitePreparationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/deliveries/${encodeURIComponent(
        deliveryScheduleId
      )}/site-preparation/start`,
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
            ? 'Delivery site preparation conflicts with its current state.'
            : response.status === 404
              ? 'Delivery was not found.'
              : 'Delivery site preparation was not started.'
      return { ok: false, error: message }
    }
    const parsed = deliveryStartSitePreparationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid delivery site-preparation result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No delivery site preparation was started.',
    }
  }
}

export async function completeDeliverySitePreparationThroughCoreApi(
  deliveryScheduleId: string,
  command: DeliveryCompleteSitePreparationCommand,
  idempotencyKey: string
): Promise<CoreResult<DeliveryCompleteSitePreparationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/deliveries/${encodeURIComponent(
        deliveryScheduleId
      )}/site-preparation/complete`,
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
            ? 'Delivery site-preparation completion conflicts with its current state.'
            : response.status === 404
              ? 'Delivery was not found.'
              : 'Delivery site preparation was not completed.'
      return { ok: false, error: message }
    }
    const parsed = deliveryCompleteSitePreparationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid site-preparation completion result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No site-preparation completion was committed.',
    }
  }
}

export async function startDeliveryInspectionThroughCoreApi(
  deliveryScheduleId: string,
  command: DeliveryStartInspectionCommand,
  idempotencyKey: string
): Promise<CoreResult<DeliveryStartInspectionResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/deliveries/${encodeURIComponent(
        deliveryScheduleId
      )}/inspection/start`,
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
            ? 'Delivery inspection conflicts with its current state.'
            : response.status === 404
              ? 'Delivery was not found.'
              : 'Delivery inspection was not started.'
      return { ok: false, error: message }
    }
    const parsed = deliveryStartInspectionResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid delivery inspection result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No delivery inspection was started.',
    }
  }
}

export async function completeDeliveryInspectionThroughCoreApi(
  deliveryScheduleId: string,
  command: DeliveryInspectionCompleteCommand,
  idempotencyKey: string
): Promise<CoreResult<DeliveryInspectionCompleteResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/deliveries/${encodeURIComponent(
        deliveryScheduleId
      )}/inspection/complete`,
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
            ? 'Delivery inspection conflicts with its current state.'
            : response.status === 404
              ? 'Delivery or inspection was not found.'
              : 'Delivery inspection was not completed.'
      return { ok: false, error: message }
    }
    const parsed = deliveryInspectionCompleteResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid delivery inspection completion result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No delivery inspection was completed.',
    }
  }
}

export async function cancelDeliveryThroughCoreApi(
  deliveryScheduleId: string,
  command: DeliveryCancelCommand,
  idempotencyKey: string
): Promise<CoreResult<DeliveryCancelResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/deliveries/${encodeURIComponent(
        deliveryScheduleId
      )}/cancel`,
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
            ? 'Delivery cancellation conflicts with its current state.'
            : response.status === 404
              ? 'Delivery was not found.'
              : 'Delivery was not cancelled.'
      return { ok: false, error: message }
    }
    const parsed = deliveryCancelResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid delivery cancellation result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No delivery was cancelled.',
    }
  }
}

export async function postStockReceiptThroughCoreApi(
  receiptId: string,
  command: StockReceiptPostCommand,
  idempotencyKey: string
): Promise<CoreResult<StockReceiptPostingResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/stock-receipts/${encodeURIComponent(
        receiptId
      )}/post`,
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
            ? 'Stock Receipt posting conflicts with its current state.'
            : response.status === 404
              ? 'Stock Receipt was not found.'
              : 'Stock Receipt was not posted.'
      return { ok: false, error: message }
    }
    const parsed = stockReceiptPostingResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Stock Receipt posting result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No Stock Receipt was posted.',
    }
  }
}

export async function reverseStockReceiptThroughCoreApi(
  receiptId: string,
  command: StockReceiptReverseCommand,
  idempotencyKey: string
): Promise<CoreResult<StockReceiptReversalResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/stock-receipts/${encodeURIComponent(
        receiptId
      )}/reverse`,
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
            ? 'Stock Receipt reversal conflicts with its current state.'
            : response.status === 404
              ? 'Stock Receipt was not found.'
              : 'Stock Receipt was not reversed.'
      return { ok: false, error: message }
    }
    const parsed = stockReceiptReversalResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Stock Receipt reversal result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No Stock Receipt was reversed.',
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

export async function postSupplierBillThroughCoreApi(
  supplierBillId: string,
  command: SupplierBillPostCommand,
  idempotencyKey: string
): Promise<CoreResult<SupplierBillPostResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/supplier-bills/${encodeURIComponent(
        supplierBillId
      )}/post`,
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
            ? 'Supplier Bill posting conflicts with its current state.'
            : response.status === 404
              ? 'Supplier Bill was not found.'
              : 'Supplier Bill was not posted.'
      return { ok: false, error: message }
    }

    const parsed = supplierBillPostResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Supplier Bill posting result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No Supplier Bill posting was committed.',
    }
  }
}

export async function reverseSupplierBillThroughCoreApi(
  supplierBillId: string,
  command: SupplierBillReverseBody,
  idempotencyKey: string
): Promise<CoreResult<SupplierBillReverseResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/supplier-bills/${encodeURIComponent(
        supplierBillId
      )}/reverse`,
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
            ? 'Supplier Bill reversal conflicts with its current state.'
            : response.status === 404
              ? 'Supplier Bill was not found.'
              : 'Supplier Bill was not reversed.'
      return { ok: false, error: message }
    }

    const parsed = supplierBillReverseResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Supplier Bill reversal result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No Supplier Bill reversal was committed.',
    }
  }
}

export async function postCashTransactionThroughCoreApi(
  cashTransactionId: string,
  command: CashTransactionPostBody,
  idempotencyKey: string
): Promise<CoreResult<CashTransactionPostResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/cash-transactions/${encodeURIComponent(
        cashTransactionId
      )}/post`,
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
            ? 'Cash transaction posting conflicts with its current state.'
            : response.status === 404
              ? 'Cash transaction was not found.'
              : 'Cash transaction was not posted.'
      return { ok: false, error: message }
    }
    const parsed = cashTransactionPostResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid cash transaction posting result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No cash transaction was posted.',
    }
  }
}

export async function saveCashDraftThroughCoreApi(
  command: CashTransactionDraftBody,
  idempotencyKey: string
): Promise<CoreResult<CashTransactionDraftResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/cash-transactions/drafts`,
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
            ? 'Cash draft conflicts with existing evidence.'
            : 'Cash draft was not saved.'
      return { ok: false, error: message }
    }
    const parsed = cashTransactionDraftResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid cash draft result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No cash draft was saved.',
    }
  }
}

export async function deleteCashDraftThroughCoreApi(
  cashTransactionId: string,
  idempotencyKey: string
): Promise<CoreResult<CashTransactionDraftDeleteResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/cash-transactions/${encodeURIComponent(
        cashTransactionId
      )}/draft`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify({}),
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
          : response.status === 404
            ? 'Cash draft was not found.'
            : 'Cash draft was not deleted.'
      return { ok: false, error: message }
    }
    const parsed = cashTransactionDraftDeleteResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid cash draft deletion result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No cash draft was deleted.',
    }
  }
}

export async function reverseCashTransactionThroughCoreApi(
  cashTransactionId: string,
  command: CashTransactionReverseBody,
  idempotencyKey: string
): Promise<CoreResult<CashTransactionReverseResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/cash-transactions/${encodeURIComponent(
        cashTransactionId
      )}/reverse`,
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
            ? 'Cash transaction reversal conflicts with its current state.'
            : response.status === 404
              ? 'Cash transaction was not found.'
              : 'Cash transaction was not reversed.'
      return { ok: false, error: message }
    }
    const parsed = cashTransactionReverseResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid cash transaction reversal result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No cash transaction was reversed.',
    }
  }
}

export async function issueCustomerInvoiceThroughCoreApi(
  invoiceId: string,
  command: CustomerInvoiceIssueCommand,
  idempotencyKey: string
): Promise<CoreResult<CustomerInvoiceIssueResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/customer-invoices/${encodeURIComponent(
        invoiceId
      )}/issue`,
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
            ? 'Customer invoice issuance conflicts with its current state.'
            : response.status === 404
              ? 'Customer invoice was not found.'
              : 'Customer invoice was not issued.'
      return { ok: false, error: message }
    }

    const parsed = customerInvoiceIssueResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid customer invoice issuance result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No customer invoice issuance was committed.',
    }
  }
}

export async function reverseCustomerInvoiceThroughCoreApi(
  invoiceId: string,
  command: CustomerInvoiceReverseBody,
  idempotencyKey: string
): Promise<CoreResult<CustomerInvoiceReverseResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/customer-invoices/${encodeURIComponent(
        invoiceId
      )}/reverse`,
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
            ? 'Customer invoice reversal conflicts with its current state.'
            : response.status === 404
              ? 'Customer invoice was not found.'
              : 'Customer invoice was not reversed.'
      return { ok: false, error: message }
    }

    const parsed = customerInvoiceReverseResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid customer invoice reversal result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No customer invoice reversal was committed.',
    }
  }
}

export async function cancelCustomerInvoiceThroughCoreApi(
  invoiceId: string,
  command: CustomerInvoiceCancelBody,
  idempotencyKey: string
): Promise<CoreResult<CustomerInvoiceCancelResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/customer-invoices/${encodeURIComponent(
        invoiceId
      )}/cancel`,
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
            ? 'Customer invoice cancellation conflicts with its current state.'
            : response.status === 404
              ? 'Customer invoice was not found.'
              : 'Customer invoice was not cancelled.'
      return { ok: false, error: message }
    }

    const parsed = customerInvoiceCancelResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid customer invoice cancellation result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No customer invoice cancellation was committed.',
    }
  }
}

export async function reverseJournalEntryThroughCoreApi(
  journalEntryId: string,
  command: JournalReverseBody,
  idempotencyKey: string
): Promise<CoreResult<JournalReverseResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/journals/${encodeURIComponent(
        journalEntryId
      )}/reverse`,
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
            ? 'Journal reversal conflicts with its current state.'
            : response.status === 404
              ? 'Journal entry was not found.'
              : 'Journal entry was not reversed.'
      return { ok: false, error: message }
    }

    const parsed = journalReverseResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid journal reversal result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No journal was reversed.',
    }
  }
}
