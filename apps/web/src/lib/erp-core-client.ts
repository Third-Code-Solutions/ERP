import 'server-only'

import { createHash, createHmac, randomUUID } from 'node:crypto'
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
  opportunityProjectConversionResultSchema,
  opportunityStageTransitionResultSchema,
  rfqQuoteResultSchema,
  rfqTransitionResultSchema,
  projectCreationResultSchema,
  purchaseOrderCreationResultSchema,
  purchaseOrderBomCreationResultSchema,
  purchaseOrdersGroupedFromBomResultSchema,
  purchaseOrderWorkflowResultSchema,
  togalBomCommitResultSchema,
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
  customerInvoiceDraftCreateResultSchema,
  customerInvoiceReverseResultSchema,
  customerInvoiceCancelResultSchema,
  documentDeleteResultSchema,
  documentIntakeResultSchema,
  documentUploadCompleteResultSchema,
  cadEvidenceCommitCommandSchema,
  cadEvidenceCommitResultSchema,
  parseCadWorkerResponse,
  publicSigningResultSchema,
  documentProcessingAcceptedSchema,
  documentProcessingStatusSchema,
  inventoryUomCreationResultSchema,
  inventoryUomUpdateResultSchema,
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
  financeCashResultSchema,
  financeReconciliationResultSchema,
  bankStatementImportResultSchema,
  notificationListResultSchema,
  notificationReadStateCommandSchema,
  notificationReadStateResultSchema,
  docuSealWebhookCommandSchema,
  docuSealWebhookResultSchema,
  assetListResultSchema,
  assetReadResultSchema,
  assetMaintenanceDueResultSchema,
  assetMaintenanceListResultSchema,
  assetMaintenanceCreationResultSchema,
  stockMovementCreationResultSchema,
  stockMovementPostingResultSchema,
  stockMovementReversalResultSchema,
  stockReceiptCreationResultSchema,
  stockReceiptPostingResultSchema,
  stockReceiptReversalResultSchema,
  deliveryScheduleCreationResultSchema,
  deliveryReceiptResultSchema,
  deliveryMarkInTransitResultSchema,
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
  type OpportunityProjectConversionResult,
  type OpportunityStageTransitionCommand,
  type OpportunityStageTransitionResult,
  type CreateProjectCommand,
  type ProjectCreationResult,
  projectCommentCreationResultSchema,
  projectCommentDeletionResultSchema,
  projectCommentListResultSchema,
  projectCommandCenterResultSchema,
  type CreateProjectCommentCommand,
  type ProjectCommentCreationResult,
  type ProjectCommentDeletionResult,
  type ProjectCommentListResult,
  type ProjectCommandCenterResult,
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
  type TogalBomCommitCommand,
  type TogalBomCommitResult,
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
  type CustomerInvoiceDraftCreateBody,
  type CustomerInvoiceDraftCreateResult,
  type CustomerInvoiceReverseBody,
  type CustomerInvoiceReverseResult,
  type CustomerInvoiceCancelBody,
  type CustomerInvoiceCancelResult,
  type DocumentDeleteResult,
  type DocumentIntakeRequest,
  type DocumentIntakeResult,
  type DocumentUploadCompleteResult,
  type CadEvidenceCommitCommand,
  type CadEvidenceCommitResult,
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
  type FinanceCashQuery,
  type FinanceCashResult,
  type FinanceReconciliationResult,
  type BankStatementImportCommand,
  type BankStatementImportResult,
  type NotificationListResult,
  type NotificationReadStateCommand,
  type NotificationReadStateResult,
  type DocuSealWebhookCommand,
  type DocuSealWebhookResult,
  type AssetListQuery,
  type AssetListResult,
  type AssetReadResult,
  type AssetMaintenanceDueQuery,
  type AssetMaintenanceDueResult,
  type AssetMaintenanceListQuery,
  type AssetMaintenanceListResult,
  type AssetMaintenanceCreationResult,
  type CreateAssetMaintenanceRecordCommand,
  type CreateStockMovementCommand,
  type StockMovementCreationResult,
  type StockMovementPostCommand,
  type StockMovementPostingResult,
  type StockMovementReverseCommand,
  type StockMovementReversalResult,
  type CreateInventoryUomCommand,
  type InventoryUomCreationResult,
  type InventoryUomUpdateResult,
  type UpdateInventoryUomCommand,
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
  type CreateDeliveryScheduleCommand,
  type DeliveryScheduleCreationResult,
  type DeliveryReceiptCommand,
  type DeliveryReceiptResult,
  type DeliveryMarkInTransitCommand,
  type DeliveryMarkInTransitResult,
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
  costEntryDeletionResultSchema,
  type CostEntryDeletionResult,
  cortexBriefQuerySchema,
  cortexBriefResultSchema,
  type CortexBriefQuery,
  type CortexBriefResult,
  cortexChatRetrievalQuerySchema,
  cortexChatRetrievalResultSchema,
  type CortexChatRetrievalQuery,
  type CortexChatRetrievalResult,
  cortexConversationContextResolveQuerySchema,
  cortexConversationContextResolveResponseSchema,
  type CortexConversationContextResolveQuery,
  type CortexConversationContextResolveResponse,
  cortexSearchResultSchema,
  type CortexSearchResult,
  universalSearchResultSchema,
  type UniversalSearchResult,
  todayCommandCenterResultSchema,
  type TodayCommandCenterResult,
  cortexGraphResponseSchema,
  type CortexGraphQuery,
  type CortexGraphResponse,
  cortexEntityFoundResponseSchema,
  type CortexEntityFoundResponse,
  type CortexEntityParams,
  cortexConversationListResponseSchema,
  cortexConversationDetailResponseSchema,
  cortexConversationUserTurnResultSchema,
  cortexConversationAssistantTurnClaimCommandSchema,
  cortexConversationAssistantTurnClaimResultSchema,
  cortexConversationAssistantTurnCompleteCommandSchema,
  cortexConversationAssistantTurnCompleteResultSchema,
  cortexAssistantGenerationStartCommandSchema,
  cortexAssistantGenerationStatusSchema,
  cortexAssistantGenerationResultSchema,
  cortexConversationAssistantTurnSignaturePayload,
  CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION,
  type CortexConversationListResponse,
  type CortexConversationDetailResponse,
  type CortexConversationUserTurnCommand,
  type CortexConversationUserTurnResult,
  type CortexConversationAssistantTurnClaimCommand,
  type CortexConversationAssistantTurnClaimResult,
  type CortexConversationAssistantTurnCompleteCommand,
  type CortexConversationAssistantTurnCompleteResult,
  type CortexAssistantGenerationStartCommand,
  type CortexAssistantGenerationResult,
  type CortexAssistantGenerationStatus,
  cortexSemanticIndexAcceptedSchema,
  cortexSemanticIndexStatusSchema,
  type CortexSemanticIndexAccepted,
  type CortexSemanticIndexCommand,
  type CortexSemanticIndexStatus,
  userRoleAssignmentResultSchema,
  type UserRoleAssignmentCommand,
  type UserRoleAssignmentResult,
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
  return tenantEnabledForCoreApiInternal(tenantId, enabled, tenantIds, true)
}

/**
 * Exact-tenant variant for sensitive read authority. Wildcard selection is
 * intentionally rejected so a brief canary cannot widen beyond its reviewed
 * tenant UUID.
 */
export function tenantEnabledForExactCoreApi(
  tenantId: string,
  enabled: string | undefined,
  tenantIds: string | undefined
): boolean {
  return tenantEnabledForCoreApiInternal(tenantId, enabled, tenantIds, false)
}

function tenantEnabledForCoreApiInternal(
  tenantId: string,
  enabled: string | undefined,
  tenantIds: string | undefined,
  allowWildcard: boolean
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
  if (allowlist.includes('*')) return allowWildcard && allowlist.length === 1

  return allowlist.includes(normalizedTenantId)
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

/** Project operational signals stay closed until a protected canary exists. */
export function projectCommandCenterReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_PROJECT_COMMAND_CENTER_READS_VIA_API,
    process.env.ERP_PROJECT_COMMAND_CENTER_READS_VIA_API_TENANT_IDS
  )
}

/** Today is a read-only canary; false/unset keeps the existing direct query. */
export function todayReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_TODAY_READS_VIA_API,
    process.env.ERP_TODAY_READS_VIA_API_TENANT_IDS
  )
}

export function projectCommentCreateWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PROJECT_COMMENT_CREATE_WRITES_VIA_API,
    process.env.ERP_PROJECT_COMMENT_CREATE_WRITES_VIA_API_TENANT_IDS
  )
}

export function projectCommentDeleteWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PROJECT_COMMENT_DELETE_WRITES_VIA_API,
    process.env.ERP_PROJECT_COMMENT_DELETE_WRITES_VIA_API_TENANT_IDS
  )
}

/** Project discussion reads stay closed until a protected tenant canary exists. */
export function projectCommentReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_PROJECT_COMMENT_READS_VIA_API,
    process.env.ERP_PROJECT_COMMENT_READS_VIA_API_TENANT_IDS
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

export function opportunityConversionWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API,
    process.env.ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API_TENANT_IDS
  )
}

export function opportunityStageWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_OPPORTUNITY_STAGE_WRITES_VIA_API,
    process.env.ERP_OPPORTUNITY_STAGE_WRITES_VIA_API_TENANT_IDS
  )
}

export function adminUserRoleAssignmentWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API,
    process.env.ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API_TENANT_IDS
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

/** Operational asset reads remain closed until the hosted asset schema and
 * protected tenant canary are approved. */
export function assetReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_ASSET_READS_VIA_API,
    process.env.ERP_ASSET_READS_VIA_API_TENANT_IDS
  )
}

/** Asset service history stays closed until its source migration and canary are approved. */
export function assetMaintenanceReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_ASSET_MAINTENANCE_READS_VIA_API,
    process.env.ERP_ASSET_MAINTENANCE_READS_VIA_API_TENANT_IDS
  )
}

/** Maintenance creation stays closed until an explicit tenant canary is approved. */
export function assetMaintenanceCreateWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_ASSET_MAINTENANCE_CREATE_WRITES_VIA_API,
    process.env.ERP_ASSET_MAINTENANCE_CREATE_WRITES_VIA_API_TENANT_IDS
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

/** Universal search authority stays closed until graph parity is reviewed. */
export function universalSearchReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_UNIVERSAL_SEARCH_READS_VIA_API,
    process.env.ERP_UNIVERSAL_SEARCH_READS_VIA_API_TENANT_IDS
  )
}

/** Cortex brief authority remains disabled until a read canary is approved. */
export function cortexBriefReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_CORTEX_BRIEF_READS_VIA_API,
    process.env.ERP_CORTEX_BRIEF_READS_VIA_API_TENANT_IDS
  )
}

/** Chat retrieval remains an exact-tenant, server-only read seam. */
export function cortexChatRetrievalReadsUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_CORTEX_CHAT_RETRIEVAL_READS_VIA_API,
    process.env.ERP_CORTEX_CHAT_RETRIEVAL_READS_VIA_API_TENANT_IDS
  )
}

/** Conversation owner/context authority remains an exact-tenant seam. */
export function cortexConversationContextReadsUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_CORTEX_CONVERSATION_CONTEXT_READS_VIA_API,
    process.env.ERP_CORTEX_CONVERSATION_CONTEXT_READS_VIA_API_TENANT_IDS
  )
}

/** Interactive Cortex graph authority remains closed until a protected canary. */
export function cortexGraphReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_CORTEX_GRAPH_READS_VIA_API,
    process.env.ERP_CORTEX_GRAPH_READS_VIA_API_TENANT_IDS
  )
}

/** Citation-backed entity context stays on the legacy path until canaried. */
export function cortexEntityReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_CORTEX_ENTITY_READS_VIA_API,
    process.env.ERP_CORTEX_ENTITY_READS_VIA_API_TENANT_IDS
  )
}

/** Saved Cortex memory reads remain on the legacy path until canaried. */
export function cortexConversationReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_CORTEX_CONVERSATION_READS_VIA_API,
    process.env.ERP_CORTEX_CONVERSATION_READS_VIA_API_TENANT_IDS
  )
}

/** User-authored Cortex memory moves separately from assistant/provider writes. */
export function cortexConversationUserTurnWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API,
    process.env.ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API_TENANT_IDS
  )
}

/** Assistant generation is independent and requires a server-only signature. */
export function cortexConversationAssistantTurnWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API,
    process.env
      .ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API_TENANT_IDS
  )
}

/** Provider-free generation jobs require an explicit exact-tenant canary. */
export function cortexAssistantGenerationJobsUseCoreApi(
  tenantId: string
): boolean {
  if (
    (process.env.ERP_CORTEX_ASSISTANT_GENERATION_JOBS_VIA_API_TENANT_IDS ?? '')
      .split(',')
      .some((entry) => entry.trim() === '*')
  ) {
    return false
  }
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_CORTEX_ASSISTANT_GENERATION_JOBS_VIA_API,
    process.env.ERP_CORTEX_ASSISTANT_GENERATION_JOBS_VIA_API_TENANT_IDS
  )
}

/** Provider-spending semantic indexing is never allowed outside an exact canary. */
export function cortexSemanticIndexJobsUseCoreApi(tenantId: string): boolean {
  if (
    (process.env.ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS ?? '')
      .split(',')
      .some((entry) => entry.trim() === '*')
  ) {
    return false
  }
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API,
    process.env.ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS
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

/** Cash register reads remain disabled until a protected finance canary is approved. */
export function financeCashReadsUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_CASH_READS_VIA_API,
    process.env.ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS
  )
}

/** Bank reconciliation register reads remain closed until protected parity is approved. */
export function financeReconciliationReadsUseCoreApi(
  tenantId: string
): boolean {
  if (
    (process.env.ERP_FINANCE_RECONCILIATION_READS_VIA_API_TENANT_IDS ?? '')
      .split(',')
      .some((entry) => entry.trim() === '*')
  ) {
    return false
  }
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_RECONCILIATION_READS_VIA_API,
    process.env.ERP_FINANCE_RECONCILIATION_READS_VIA_API_TENANT_IDS
  )
}

/** Bank-statement imports delegate only for an exact tenant canary. */
export function financeReconciliationImportWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_VIA_API,
    process.env.ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_VIA_API_TENANT_IDS
  )
}

/** Storage-backed bank imports stay closed unless upload and Core authority
 * are both explicitly enabled for the exact tenant. */
export function financeReconciliationStorageUploadsUseCoreApi(
  tenantId: string
): boolean {
  return (
    financeReconciliationImportWritesUseCoreApi(tenantId) &&
    tenantEnabledForExactCoreApi(
      tenantId,
      process.env.ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS,
      process.env.ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS
    )
  )
}

/** Notification list/read-state authority remains closed until user-scope parity is approved. */
export function notificationReadStateUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_NOTIFICATION_READ_STATE_VIA_API,
    process.env.ERP_NOTIFICATION_READ_STATE_VIA_API_TENANT_IDS
  )
}

/** DocuSeal business writes are delegated only for an exact tenant canary. */
export function docuSealWebhookUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_DOCUSEAL_WEBHOOK_VIA_API,
    process.env.ERP_DOCUSEAL_WEBHOOK_VIA_API_TENANT_IDS
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

export function inventoryUomUpdateWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_INVENTORY_UOM_UPDATE_VIA_API,
    process.env.ERP_INVENTORY_UOM_UPDATE_TENANT_IDS
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

export function togalBomCommitWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_BOM_TOGAL_COMMIT_VIA_API,
    process.env.ERP_BOM_TOGAL_COMMIT_VIA_API_TENANT_IDS
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

export function financeCustomerInvoiceDraftCreateWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_VIA_API,
    process.env.ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_VIA_API_TENANT_IDS
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

export function deliveryScheduleCreateWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DELIVERY_SCHEDULE_CREATE_WRITES_VIA_API,
    process.env.ERP_DELIVERY_SCHEDULE_CREATE_WRITES_VIA_API_TENANT_IDS
  )
}

export function deliveryMarkInTransitWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API,
    process.env.ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API_TENANT_IDS
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
 * CAD evidence commits are delegated only for an explicit tenant canary. The
 * selector is separate from processing-job intake so evidence authority can
 * be proven before any queue or draft-BOM cutover.
 */
export function cadEvidenceCommitWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForExactCoreApi(
    tenantId,
    process.env.ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API,
    process.env.ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API_TENANT_IDS
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

/**
 * Document intake is delegated only for an explicit tenant canary. The upload
 * route remains legacy-authoritative for the default closed gate and for all
 * extractor formats.
 */
export function documentIntakeWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_DOCUMENT_INTAKE_WRITES_VIA_API,
    process.env.ERP_DOCUMENT_INTAKE_WRITES_VIA_API_TENANT_IDS
  )
}

/**
 * The first Web canary only covers uploads that the legacy route records
 * without running an extractor. CAD, visual, spreadsheet, CSV, and document
 * formats remain on the legacy path until their response and processing
 * parity are independently proven.
 */
export function documentIntakeCanarySupportsUpload(request: {
  fileName: string
  mimeType: string
}): boolean {
  const extension = request.fileName.split('.').pop()?.toLowerCase() ?? ''
  const extractorExtensions = new Set([
    'dxf',
    'dwg',
    'pdf',
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif',
    'heic',
    'xlsx',
    'xls',
    'csv',
    'docx',
    'doc',
  ])
  if (extractorExtensions.has(extension)) return false

  const mimeType = request.mimeType.toLowerCase()
  return !(
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType === 'text/csv' ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword'
  )
}

/** Exact authority selector used by the legacy upload route. */
export function documentIntakeCanarySelectedForUpload(
  tenantId: string,
  request: { fileName: string; mimeType: string }
): boolean {
  return (
    documentIntakeWritesUseCoreApi(tenantId) &&
    documentIntakeCanarySupportsUpload(request)
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

/**
 * Read-only universal-search adapter. A selected Core failure is returned to
 * the caller; the compatibility route must not silently regain authority.
 */
export async function searchUniversalThroughCoreApi(
  query: string,
  limit = 80
): Promise<CoreResult<UniversalSearchResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`,
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
            : 'Universal search service is unavailable.',
      }
    }

    const parsed = universalSearchResultSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid universal search result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Universal search service is unavailable.',
    }
  }
}

/**
 * Read-only Cortex brief adapter. Core failures fail closed for a selected
 * tenant; the legacy direct database path must not silently regain authority.
 */
export async function getCortexBriefThroughCoreApi(
  query: CortexBriefQuery | number = 12
): Promise<CoreResult<CortexBriefResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  const parsedQuery = cortexBriefQuerySchema.safeParse(
    typeof query === 'number' ? { limit: query } : query
  )
  if (!parsedQuery.success) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid Cortex brief query.',
    }
  }

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/brief?limit=${parsedQuery.data.limit}`,
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
            : 'Cortex brief service is unavailable.',
      }
    }

    const parsed = cortexBriefResultSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid Cortex brief result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex brief service is unavailable.',
    }
  }
}

/**
 * Read-only chat retrieval adapter. The Web chat route does not call this yet;
 * when it does, a selected tenant must receive a Core error rather than
 * silently regaining direct database authority.
 */
export async function getCortexChatRetrievalThroughCoreApi(
  query: CortexChatRetrievalQuery
): Promise<CoreResult<CortexChatRetrievalResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  const parsedQuery = cortexChatRetrievalQuerySchema.safeParse(query)
  if (!parsedQuery.success) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid Cortex chat retrieval query.',
    }
  }

  const params = new URLSearchParams({
    query: parsedQuery.data.query,
    recentLimit: String(parsedQuery.data.recentLimit),
    matchLimit: String(parsedQuery.data.matchLimit),
  })
  if (parsedQuery.data.focus) {
    params.set('focus', JSON.stringify(parsedQuery.data.focus))
  }

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/chat-retrieval?${params.toString()}`,
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
            : 'Cortex chat retrieval service is unavailable.',
      }
    }

    const parsed = cortexChatRetrievalResultSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid Cortex chat retrieval result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex chat retrieval service is unavailable.',
    }
  }
}

/**
 * Read-only owner/context adapter. It transports focus as JSON and does not
 * carry tenant, user, or role fields because Core derives those from auth.
 */
export async function getCortexConversationContextThroughCoreApi(
  query: CortexConversationContextResolveQuery
): Promise<CoreResult<CortexConversationContextResolveResponse>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  const parsedQuery = cortexConversationContextResolveQuerySchema.safeParse(query)
  if (!parsedQuery.success) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid Cortex conversation context query.',
    }
  }

  const params = new URLSearchParams()
  if (parsedQuery.data.conversationId) {
    params.set('conversationId', parsedQuery.data.conversationId)
  }
  if (parsedQuery.data.context) {
    params.set('context', JSON.stringify(parsedQuery.data.context))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/conversation-context${suffix}`,
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
            : 'Cortex conversation context service is unavailable.',
      }
    }

    const parsed = cortexConversationContextResolveResponseSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error:
          'ERP Core API returned an invalid Cortex conversation context result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex conversation context service is unavailable.',
    }
  }
}

/**
 * Read-only Cortex graph adapter. Selected tenants fail closed on Core errors;
 * the route must never silently fall back to direct database authority.
 */
export async function getCortexGraphThroughCoreApi(
  query: CortexGraphQuery
): Promise<CoreResult<CortexGraphResponse>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  const params = new URLSearchParams()
  if (query.refTable && query.refId) {
    params.set('refTable', query.refTable)
    params.set('refId', query.refId)
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''

  try {
    const response = await fetch(`${access.baseUrl}/v1/cortex/graph${suffix}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        'x-request-id': randomUUID(),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    const rawBody: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const body = rawBody as { message?: unknown } | null
      return {
        ok: false,
        status: response.status,
        error:
          typeof body?.message === 'string'
            ? body.message
            : 'Cortex graph service is unavailable.',
      }
    }

    const parsed = cortexGraphResponseSchema.safeParse(rawBody)
    const requestedFocus = Boolean(query.refTable && query.refId)
    const receivedFocus =
      parsed.success && Object.hasOwn(parsed.data, 'focusNodeId')
    if (!parsed.success || requestedFocus !== receivedFocus) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid Cortex graph result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex graph service is unavailable.',
    }
  }
}

/**
 * Read-only Cortex entity adapter. Once selected, Core errors fail closed and
 * never fall back to direct database authority.
 */
export async function getCortexEntityThroughCoreApi(
  params: CortexEntityParams
): Promise<CoreResult<CortexEntityFoundResponse>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  const refTable = encodeURIComponent(params.refTable)
  const refId = encodeURIComponent(params.refId)
  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/entity/${refTable}/${refId}`,
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
            : 'Cortex entity service is unavailable.',
      }
    }

    const parsed = cortexEntityFoundResponseSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid Cortex entity result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex entity service is unavailable.',
    }
  }
}

/**
 * Read-only saved-memory adapter. Selected tenants fail closed on Core errors
 * so direct database authority cannot silently return during a canary.
 */
export async function listCortexConversationsThroughCoreApi(): Promise<
  CoreResult<CortexConversationListResponse>
> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(`${access.baseUrl}/v1/cortex/conversations`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        'x-request-id': randomUUID(),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    const rawBody: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const body = rawBody as { message?: unknown } | null
      return {
        ok: false,
        status: response.status,
        error:
          typeof body?.message === 'string'
            ? body.message
            : 'Cortex conversation service is unavailable.',
      }
    }

    const parsed = cortexConversationListResponseSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid Cortex conversation list.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex conversation service is unavailable.',
    }
  }
}

export async function getCortexConversationThroughCoreApi(
  conversationId: string
): Promise<CoreResult<CortexConversationDetailResponse>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/conversations/${encodeURIComponent(conversationId)}`,
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
            : 'Cortex conversation service is unavailable.',
      }
    }

    const parsed = cortexConversationDetailResponseSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid Cortex conversation.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex conversation service is unavailable.',
    }
  }
}

/**
 * Writes exactly one authenticated user's turn. Selected tenants fail closed;
 * browser-supplied assistant roles are not part of this contract.
 */
export async function appendCortexConversationUserTurnThroughCoreApi(
  command: CortexConversationUserTurnCommand,
  idempotencyKey: string
): Promise<CoreResult<CortexConversationUserTurnResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/conversations/user-turns`,
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
            : 'Cortex user turn was not stored.',
      }
    }

    const parsed = cortexConversationUserTurnResultSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid Cortex user-turn result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex user-turn service is unavailable.',
    }
  }
}

interface CortexAssistantTurnPrincipalScope {
  tenantId: string
  userId: string
}

function cortexAssistantTurnHeaders(
  operation: 'claim' | 'complete' | 'start_job',
  command: object,
  idempotencyKey: string,
  principal: CortexAssistantTurnPrincipalScope
): CoreResult<Record<string, string>> {
  const secret = process.env.ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET?.trim()
  if (!secret || secret.length < 32) {
    return {
      ok: false,
      status: 503,
      error: 'Cortex assistant-turn signing is not configured.',
    }
  }
  const timestamp = String(Math.floor(Date.now() / 1_000))
  const commandDigest = createHash('sha256')
    .update(JSON.stringify(command), 'utf8')
    .digest('hex')
  const payload = cortexConversationAssistantTurnSignaturePayload({
    operation,
    timestamp,
    tenantId: principal.tenantId,
    userId: principal.userId,
    idempotencyKey,
    commandDigest,
  })
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return {
    ok: true,
    data: {
      'Idempotency-Key': idempotencyKey,
      'X-Third-Code-Timestamp': timestamp,
      'X-Third-Code-Cortex-Signature':
        `${CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION}=${signature}`,
    },
  }
}

export function cortexAssistantTurnIdempotencyKey(
  userTurnIdempotencyKey: string
): string {
  return `assistant-${createHash('sha256')
    .update(userTurnIdempotencyKey, 'utf8')
    .digest('hex')}`
}

export async function claimCortexConversationAssistantTurnThroughCoreApi(
  command: CortexConversationAssistantTurnClaimCommand,
  idempotencyKey: string,
  principal: CortexAssistantTurnPrincipalScope
): Promise<CoreResult<CortexConversationAssistantTurnClaimResult>> {
  const parsedCommand =
    cortexConversationAssistantTurnClaimCommandSchema.safeParse(command)
  if (!parsedCommand.success) {
    return { ok: false, status: 400, error: 'Invalid assistant generation.' }
  }
  const signed = cortexAssistantTurnHeaders(
    'claim',
    parsedCommand.data,
    idempotencyKey,
    principal
  )
  if (!signed.ok || !signed.data) {
    return { ok: false, status: signed.status, error: signed.error }
  }
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/conversations/assistant-turns/claims`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          ...signed.data,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(parsedCommand.data),
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
            : 'Assistant generation was not claimed.',
      }
    }
    const parsed =
      cortexConversationAssistantTurnClaimResultSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid assistant generation claim.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex assistant generation service is unavailable.',
    }
  }
}

export async function completeCortexConversationAssistantTurnThroughCoreApi(
  command: CortexConversationAssistantTurnCompleteCommand,
  idempotencyKey: string,
  principal: CortexAssistantTurnPrincipalScope
): Promise<CoreResult<CortexConversationAssistantTurnCompleteResult>> {
  const parsedCommand =
    cortexConversationAssistantTurnCompleteCommandSchema.safeParse(command)
  if (!parsedCommand.success) {
    return { ok: false, status: 400, error: 'Invalid assistant completion.' }
  }
  const signed = cortexAssistantTurnHeaders(
    'complete',
    parsedCommand.data,
    idempotencyKey,
    principal
  )
  if (!signed.ok || !signed.data) {
    return { ok: false, status: signed.status, error: signed.error }
  }
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/conversations/assistant-turns/complete`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          ...signed.data,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(parsedCommand.data),
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
            : 'Assistant turn was not stored.',
      }
    }
    const parsed =
      cortexConversationAssistantTurnCompleteResultSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid assistant completion.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex assistant completion service is unavailable.',
    }
  }
}

export async function startCortexAssistantGenerationJobThroughCoreApi(
  command: CortexAssistantGenerationStartCommand,
  idempotencyKey: string,
  principal: CortexAssistantTurnPrincipalScope
): Promise<CoreResult<CortexAssistantGenerationStatus>> {
  const parsedCommand =
    cortexAssistantGenerationStartCommandSchema.safeParse(command)
  if (!parsedCommand.success) {
    return { ok: false, status: 400, error: 'Invalid assistant generation job.' }
  }
  const signed = cortexAssistantTurnHeaders(
    'start_job',
    parsedCommand.data,
    idempotencyKey,
    principal
  )
  if (!signed.ok || !signed.data) {
    return { ok: false, status: signed.status, error: signed.error }
  }
  const access = await getCoreApiAccess()
  if (!access.ok) return access
  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/conversations/assistant-turns/jobs`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          ...signed.data,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(parsedCommand.data),
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
            : 'Assistant generation job was not started.',
      }
    }
    const parsed = cortexAssistantGenerationStatusSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid assistant generation job.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Assistant generation job service is unavailable.',
    }
  }
}

export async function getCortexAssistantGenerationJobThroughCoreApi(
  jobId: string
): Promise<CoreResult<CortexAssistantGenerationStatus>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access
  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/conversations/assistant-turns/jobs/${encodeURIComponent(jobId)}`,
      {
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
      return {
        ok: false,
        status: response.status,
        error: 'Assistant generation job status is unavailable.',
      }
    }
    const parsed = cortexAssistantGenerationStatusSchema.safeParse(rawBody)
    return parsed.success
      ? { ok: true, data: parsed.data, status: response.status }
      : {
          ok: false,
          status: 503,
          error: 'ERP Core API returned an invalid assistant generation status.',
        }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Assistant generation job status is unavailable.',
    }
  }
}

export async function getCortexAssistantGenerationResultThroughCoreApi(
  jobId: string
): Promise<CoreResult<CortexAssistantGenerationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access
  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/conversations/assistant-turns/jobs/${encodeURIComponent(jobId)}/result`,
      {
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
            : 'Assistant generation result is unavailable.',
      }
    }
    const parsed = cortexAssistantGenerationResultSchema.safeParse(rawBody)
    return parsed.success
      ? { ok: true, data: parsed.data, status: response.status }
      : {
          ok: false,
          status: 503,
          error: 'ERP Core API returned an invalid assistant generation result.',
        }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Assistant generation result is unavailable.',
    }
  }
}

export async function cancelCortexAssistantGenerationJobThroughCoreApi(
  jobId: string,
  idempotencyKey: string
): Promise<CoreResult<CortexAssistantGenerationStatus>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access
  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/conversations/assistant-turns/jobs/${encodeURIComponent(jobId)}/cancel`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      }
    )
    const rawBody: unknown = await response.json().catch(() => null)
    const parsed = cortexAssistantGenerationStatusSchema.safeParse(rawBody)
    if (!response.ok || !parsed.success) {
      return {
        ok: false,
        status: response.status || 503,
        error: 'Assistant generation job was not cancelled.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Assistant generation cancellation is unavailable.',
    }
  }
}

export async function createCortexSemanticIndexJobThroughCoreApi(
  command: CortexSemanticIndexCommand,
  idempotencyKey: string
): Promise<CoreResult<CortexSemanticIndexAccepted | CortexSemanticIndexStatus>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/semantic-index-jobs`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
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
            : 'Cortex semantic index service is unavailable.',
      }
    }
    const accepted = cortexSemanticIndexAcceptedSchema.safeParse(rawBody)
    if (accepted.success) return { ok: true, data: accepted.data }
    const status = cortexSemanticIndexStatusSchema.safeParse(rawBody)
    if (!status.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid semantic index job.',
      }
    }
    return { ok: true, data: status.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex semantic index service is unavailable.',
    }
  }
}

export async function getCortexSemanticIndexJobThroughCoreApi(
  jobId: string
): Promise<CoreResult<CortexSemanticIndexStatus>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/cortex/semantic-index-jobs/${encodeURIComponent(jobId)}`,
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
            : 'Cortex semantic index service is unavailable.',
      }
    }
    const parsed = cortexSemanticIndexStatusSchema.safeParse(rawBody)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid semantic index status.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'Cortex semantic index service is unavailable.',
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

/**
 * Server-only, unconnected document-intake adapter. It never falls back to a
 * Web database write after the caller selects the Core authority.
 */
export async function createDocumentThroughCoreApi(
  request: DocumentIntakeRequest,
  idempotencyKey: string
): Promise<CoreResult<DocumentIntakeResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(`${access.baseUrl}/v1/documents`, {
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
    })
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Document intake conflicts with an existing command.'
            : response.status === 404
              ? 'Project was not found.'
              : response.status === 503
                ? 'Document intake is not enabled for this tenant.'
                : 'Document was not recorded.'
      return { ok: false, error: message, status: response.status }
    }

    const parsed = documentIntakeResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid document intake result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No document was recorded.',
      status: 503,
    }
  }
}

/**
 * Disposable Web canary harness for legacy upload response parity. It is not
 * connected to /api/upload/complete; callers must explicitly select both the
 * tenant gate and the non-extractor format. A Core error is terminal and
 * never falls back to a Web database write.
 */
export async function completeDocumentUploadThroughCoreCanary(
  request: DocumentIntakeRequest,
  tenantId: string,
  idempotencyKey: string
): Promise<CoreResult<DocumentUploadCompleteResult>> {
  if (!documentIntakeWritesUseCoreApi(tenantId)) {
    return {
      ok: false,
      error: 'Document intake canary is not enabled for this tenant.',
      status: 503,
    }
  }
  if (!documentIntakeCanarySupportsUpload(request)) {
    return {
      ok: false,
      error: 'Document intake canary does not support this upload format.',
      status: 400,
    }
  }

  const coreResult = await createDocumentThroughCoreApi(
    request,
    idempotencyKey
  )
  if (!coreResult.ok || !coreResult.data) {
    return {
      ok: false,
      error: coreResult.error ?? 'Document intake failed in ERP Core.',
      status: coreResult.status,
    }
  }

  const parsed = documentUploadCompleteResultSchema.safeParse({
    id: coreResult.data.documentId,
    storagePath: coreResult.data.storagePath,
    documentType: coreResult.data.documentType,
    cadFormat: null,
    cadParseQueued: false,
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: 'ERP Core returned an invalid legacy upload response.',
      status: 502,
    }
  }
  return { ok: true, data: parsed.data, status: coreResult.status }
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
      `${access.baseUrl}/v1/projects/${encodeURIComponent(projectId)}`,
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

export async function assignUserRoleThroughCoreApi(
  userId: string,
  command: UserRoleAssignmentCommand,
  idempotencyKey: string
): Promise<CoreResult<UserRoleAssignmentResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/admin/users/${encodeURIComponent(userId)}/role`,
      {
        method: 'PATCH',
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
            ? 'User role changed after this form was opened.'
            : 'User role assignment was not committed.'
      return { ok: false, error: message, status: response.status }
    }

    const parsed = userRoleAssignmentResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid user role result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No user role was changed.',
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

export async function getProjectCommandCenterThroughCoreApi(
  projectId: string
): Promise<CoreResult<ProjectCommandCenterResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${encodeURIComponent(projectId)}/command-center`,
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
            : 'Project command center was not completed.',
        status: response.status,
      }
    }

    const parsed = projectCommandCenterResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid project command center result.',
        status: response.status,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Project signals were not read.',
      status: 503,
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

export async function getFinanceCashThroughCoreApi(
  query: FinanceCashQuery
): Promise<CoreResult<FinanceCashResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams()
    if (query.cashAccountId) params.set('cashAccountId', query.cashAccountId)
    if (query.direction) params.set('direction', query.direction)
    if (query.status) params.set('status', query.status)
    if (query.fromDate) params.set('fromDate', query.fromDate)
    if (query.toDate) params.set('toDate', query.toDate)
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))

    const response = await fetch(
      `${access.baseUrl}/v1/finance/cash-transactions?${params.toString()}`,
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
            ? 'Cash transaction filters are invalid.'
            : response.status === 403
              ? 'You do not have permission to view cash transactions.'
              : 'Cash transactions were not completed.',
        status: response.status,
      }
    }

    const parsed = financeCashResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid cash transaction result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Cash transactions were not read.',
    }
  }
}

export async function getFinanceReconciliationThroughCoreApi(
  limit = 500
): Promise<CoreResult<FinanceReconciliationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams({ limit: String(limit) })
    const response = await fetch(
      `${access.baseUrl}/v1/finance/reconciliation?${params.toString()}`,
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
            ? 'Bank reconciliation query is invalid.'
            : response.status === 403
              ? 'You do not have permission to view bank reconciliation.'
              : 'Bank reconciliation was not completed.',
        status: response.status,
      }
    }

    const parsed = financeReconciliationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid bank reconciliation result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Bank reconciliation was not read.',
    }
  }
}

/**
 * Server-only bank-statement import adapter. Once selected, a Core error is
 * terminal; the caller must not fall back to the legacy Web database write.
 */
export async function createBankStatementThroughCoreApi(
  command: BankStatementImportCommand,
  idempotencyKey: string
): Promise<CoreResult<BankStatementImportResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/finance/reconciliation/import`,
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
      return {
        ok: false,
        error:
          response.status === 400
            ? 'Bank statement import details are invalid.'
            : response.status === 403
              ? 'You do not have permission to import bank statements.'
              : response.status === 409
                ? 'That bank statement import conflicts with existing evidence.'
                : response.status === 503
                  ? 'Bank statement import is not enabled for this tenant.'
                  : 'Bank statement was not imported.',
        status: response.status,
      }
    }
    const parsed = bankStatementImportResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid bank statement import result.',
        status: 502,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No bank statement was imported.',
      status: 503,
    }
  }
}

export async function getNotificationsThroughCoreApi(): Promise<
  CoreResult<NotificationListResult>
> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(`${access.baseUrl}/v1/notifications`, {
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
        error:
          response.status === 403
            ? 'You do not have permission to view notifications.'
            : 'Notifications were not loaded.',
        status: response.status,
      }
    }
    const parsed = notificationListResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid notification result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Notifications were not loaded.',
    }
  }
}

/**
 * Server-only service-to-service webhook adapter. It intentionally uses a
 * separate internal token rather than a browser session because DocuSeal has
 * no Supabase user principal. Selected-Core failures are terminal.
 */
export async function processDocuSealWebhookThroughCoreApi(
  command: DocuSealWebhookCommand
): Promise<CoreResult<DocuSealWebhookResult>> {
  const parsedCommand = docuSealWebhookCommandSchema.safeParse(command)
  if (!parsedCommand.success) {
    return { ok: false, error: 'DocuSeal webhook payload is invalid.', status: 400 }
  }

  const baseUrl = getCoreApiBaseUrl()
  const internalToken = process.env.ERP_CORE_WEBHOOK_TOKEN?.trim()
  if (!baseUrl || !internalToken) {
    return {
      ok: false,
      error: 'ERP Core webhook access is not configured.',
      status: 503,
    }
  }

  try {
    const response = await fetch(`${baseUrl}/v1/webhooks/docuseal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-erp-core-webhook-token': internalToken,
        'x-request-id': randomUUID(),
      },
      body: JSON.stringify(parsedCommand.data),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 401
            ? 'ERP Core webhook access was rejected.'
            : response.status === 503
              ? 'ERP Core webhook authority is not enabled for this tenant.'
              : 'DocuSeal webhook was not committed.',
        status: response.status,
      }
    }
    const parsed = docuSealWebhookResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core returned an invalid DocuSeal webhook result.',
        status: 502,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core webhook authority is unavailable.',
      status: 503,
    }
  }
}

export async function markNotificationReadStateThroughCoreApi(
  command: NotificationReadStateCommand
): Promise<CoreResult<NotificationReadStateResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  const parsedCommand = notificationReadStateCommandSchema.safeParse(command)
  if (!parsedCommand.success) {
    return { ok: false, error: 'Notification read-state command is invalid.' }
  }

  try {
    const response = await fetch(`${access.baseUrl}/v1/notifications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        'content-type': 'application/json',
        'x-request-id': randomUUID(),
      },
      body: JSON.stringify(parsedCommand.data),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 400
            ? 'Notification read-state command is invalid.'
            : response.status === 403
              ? 'You do not have permission to update notifications.'
              : 'Notification read state was not updated.',
        status: response.status,
      }
    }
    const parsed = notificationReadStateResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid notification update result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. Notification read state was not updated.',
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

export async function getTodayThroughCoreApi(
  includeProjects = false
): Promise<CoreResult<TodayCommandCenterResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams({
      includeProjects: String(includeProjects),
    })
    const response = await fetch(
      `${access.baseUrl}/v1/today?${params.toString()}`,
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
          response.status === 403
            ? 'You do not have permission to read Today.'
            : 'Today data was not completed.',
        status: response.status,
      }
    }

    const parsed = todayCommandCenterResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Today result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Today data was not read.',
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

export async function getAssetsThroughCoreApi(
  query: AssetListQuery
): Promise<CoreResult<AssetListResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams()
    if (query.q) params.set('q', query.q)
    if (query.kind) params.set('kind', query.kind)
    if (query.status) params.set('status', query.status)
    params.set('sort', query.sort)
    params.set('order', query.order)
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))

    const response = await fetch(`${access.baseUrl}/v1/assets?${params.toString()}`, {
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
        error:
          response.status === 400
            ? 'Asset register filters are invalid.'
            : response.status === 403
              ? 'You do not have permission to view assets.'
              : response.status === 503
                ? 'Asset register is not enabled for this tenant.'
                : 'Asset register was not completed.',
        status: response.status,
      }
    }

    const parsed = assetListResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid asset register result.',
        status: 503,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Assets were not read.',
      status: 503,
    }
  }
}

export async function getAssetThroughCoreApi(
  assetId: string
): Promise<CoreResult<AssetReadResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/assets/${encodeURIComponent(assetId)}`,
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
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 404
            ? 'Asset was not found.'
            : response.status === 403
              ? 'You do not have permission to view this asset.'
              : response.status === 503
                ? 'Asset register is not enabled for this tenant.'
                : 'Asset detail was not completed.',
        status: response.status,
      }
    }
    const parsed = assetReadResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid asset detail result.',
        status: 503,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Asset detail was not read.',
      status: 503,
    }
  }
}

export async function getAssetMaintenanceThroughCoreApi(
  assetId: string,
  query: AssetMaintenanceListQuery
): Promise<CoreResult<AssetMaintenanceListResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams({
      page: String(query.page),
      limit: String(query.limit),
    })
    const response = await fetch(
      `${access.baseUrl}/v1/assets/${encodeURIComponent(assetId)}/maintenance?${params.toString()}`,
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
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 404
            ? 'Asset was not found.'
            : response.status === 403
              ? 'You do not have permission to view maintenance history.'
              : response.status === 503
                ? 'Asset maintenance history is not enabled for this tenant.'
                : 'Asset maintenance history was not completed.',
        status: response.status,
      }
    }
    const parsed = assetMaintenanceListResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid asset maintenance result.',
        status: 503,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Maintenance history was not read.',
      status: 503,
    }
  }
}

export async function getAssetMaintenanceDueThroughCoreApi(
  query: AssetMaintenanceDueQuery
): Promise<CoreResult<AssetMaintenanceDueResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams({
      daysAhead: String(query.daysAhead),
      page: String(query.page),
      limit: String(query.limit),
    })
    if (query.asOf) params.set('asOf', query.asOf)
    const response = await fetch(
      `${access.baseUrl}/v1/assets/maintenance/due?${params.toString()}`,
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
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 403
            ? 'You do not have permission to view maintenance due items.'
            : response.status === 503
              ? 'Asset maintenance reads are not enabled for this tenant.'
              : 'Maintenance due items were not completed.',
        status: response.status,
      }
    }
    const parsed = assetMaintenanceDueResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid maintenance due result.',
        status: 503,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Maintenance due items were not read.',
      status: 503,
    }
  }
}

export async function createAssetMaintenanceThroughCoreApi(
  assetId: string,
  command: CreateAssetMaintenanceRecordCommand,
  idempotencyKey: string
): Promise<CoreResult<AssetMaintenanceCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/assets/${encodeURIComponent(assetId)}/maintenance`,
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
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 503
            ? 'Asset maintenance creation is not enabled for this tenant.'
            : response.status === 409
              ? 'Asset maintenance conflicts with existing asset state.'
              : 'Asset maintenance was not created.'
      return { ok: false, error: message, status: response.status }
    }
    const parsed = assetMaintenanceCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid asset maintenance result.',
        status: 503,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No maintenance record was created.',
      status: 503,
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

export async function updateInventoryUomThroughCoreApi(
  uomId: string,
  command: UpdateInventoryUomCommand
): Promise<CoreResult<InventoryUomUpdateResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/inventory/uoms/${encodeURIComponent(uomId)}`,
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
            ? 'UOM not found.'
            : 'Inventory UOM was not updated.'
      return { ok: false, error: message }
    }

    const parsed = inventoryUomUpdateResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid inventory UOM update result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No inventory UOM was updated.',
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

export async function convertOpportunityToProjectThroughCoreApi(
  opportunityId: string,
  idempotencyKey: string
): Promise<CoreResult<OpportunityProjectConversionResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/crm/opportunities/${encodeURIComponent(
        opportunityId
      )}/convert-to-project`,
      {
        method: 'POST',
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
          : response.status === 503
            ? 'Won-to-Project handoff is not enabled for this tenant.'
            : response.status === 404
              ? 'Opportunity not found.'
              : 'Project handoff was not completed.'
      return { ok: false, error: message, status: response.status }
    }
    const parsed = opportunityProjectConversionResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Project handoff result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No Project handoff was completed.',
    }
  }
}

export async function transitionOpportunityStageThroughCoreApi(
  opportunityId: string,
  command: OpportunityStageTransitionCommand,
  idempotencyKey: string
): Promise<CoreResult<OpportunityStageTransitionResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/crm/opportunities/${encodeURIComponent(
        opportunityId
      )}/stage-transition`,
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
          : response.status === 404
            ? 'Opportunity not found.'
            : response.status === 503
              ? 'Opportunity stage transition is not enabled for this tenant.'
              : 'Opportunity stage transition was not completed.'
      return { ok: false, error: message, status: response.status }
    }
    const parsed = opportunityStageTransitionResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Opportunity stage transition result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No Opportunity stage transition was committed.',
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

export async function createProjectCommentThroughCoreApi(
  command: CreateProjectCommentCommand,
  idempotencyKey: string
): Promise<CoreResult<ProjectCommentCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${encodeURIComponent(
        command.projectId
      )}/comments`,
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
            ? 'Project comment creation is not enabled for this tenant.'
            : response.status === 404
              ? 'Project not found.'
              : response.status === 409
                ? 'Project comment request conflicts with an earlier command.'
                : 'Project comment was not created.'
      return { ok: false, error: message, status: response.status }
    }

    const parsed = projectCommentCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid project comment result.',
        status: response.status,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No project comment was created.',
      status: 503,
    }
  }
}

export async function getProjectCommentsThroughCoreApi(
  projectId: string,
  limit = 100
): Promise<CoreResult<ProjectCommentListResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const params = new URLSearchParams({ limit: String(limit) })
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${encodeURIComponent(
        projectId
      )}/comments?${params.toString()}`,
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
            ? 'Project comment list filters are invalid.'
            : response.status === 404
              ? 'Project not found.'
              : 'Project comments were not read.',
        status: response.status,
      }
    }

    const parsed = projectCommentListResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid project comment list result.',
        status: response.status,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Project comments were not read.',
      status: 503,
    }
  }
}

export async function deleteProjectCommentThroughCoreApi(
  projectId: string,
  commentId: string,
  idempotencyKey: string
): Promise<CoreResult<ProjectCommentDeletionResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${encodeURIComponent(
        projectId
      )}/comments/${encodeURIComponent(commentId)}`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'Idempotency-Key': idempotencyKey,
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
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 503
            ? 'Project comment deletion is not enabled for this tenant.'
            : response.status === 404
              ? 'Project comment not found.'
              : response.status === 409
                ? 'Project comment deletion conflicts with an earlier command.'
                : 'Project comment was not deleted.'
      return { ok: false, error: message, status: response.status }
    }

    const parsed = projectCommentDeletionResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid project comment deletion result.',
        status: response.status,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No project comment was deleted.',
      status: 503,
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

export async function deleteCostEntryThroughCoreApi(
  projectId: string,
  costEntryId: string,
  reason: string,
  idempotencyKey: string
): Promise<CoreResult<CostEntryDeletionResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${encodeURIComponent(projectId)}/cost-entries/${encodeURIComponent(costEntryId)}`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify({ reason }),
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
            ? 'Cost entry deletion is not enabled for this tenant.'
            : response.status === 409
              ? 'Cost entry could not be voided.'
              : 'Cost entry was not voided.'
      return { ok: false, error: message, status: response.status }
    }

    const parsed = costEntryDeletionResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid cost entry deletion result.',
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No cost entry was changed.',
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

export async function commitTogalBomThroughCoreApi(
  command: TogalBomCommitCommand,
  idempotencyKey: string
): Promise<CoreResult<TogalBomCommitResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/boms/togal-commit`,
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
            ? 'Togal BOM commit conflicts with the BOM state or idempotency key.'
            : response.status === 404
              ? 'BOM was not found.'
              : 'Togal BOM lines were not committed.'
      return { ok: false, status: response.status, error: message }
    }

    const parsed = togalBomCommitResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        status: 503,
        error: 'ERP Core API returned an invalid Togal BOM commit result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. No Togal BOM lines were committed.',
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

export async function createDeliveryScheduleThroughCoreApi(
  command: CreateDeliveryScheduleCommand,
  idempotencyKey: string
): Promise<CoreResult<DeliveryScheduleCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/deliveries`,
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
            ? 'Delivery schedule conflicts with existing ERP state.'
            : response.status === 404
              ? 'Purchase order was not found.'
              : 'Delivery schedule was not created.'
      return { ok: false, error: message }
    }
    const parsed = deliveryScheduleCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid delivery schedule result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No delivery schedule was committed.',
    }
  }
}

export async function markDeliveryInTransitThroughCoreApi(
  deliveryScheduleId: string,
  command: DeliveryMarkInTransitCommand,
  idempotencyKey: string
): Promise<CoreResult<DeliveryMarkInTransitResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/deliveries/${encodeURIComponent(
        deliveryScheduleId
      )}/in-transit`,
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
            ? 'Delivery in-transit transition conflicts with its current state.'
            : response.status === 404
              ? 'Delivery was not found.'
              : 'Delivery was not marked in transit.'
      return { ok: false, error: message }
    }
    const parsed = deliveryMarkInTransitResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid delivery in-transit result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No delivery in-transit transition was committed.',
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

/**
 * Server-only CAD evidence adapter. Core is authoritative for scope-item
 * replacement, idempotency, exact totals, and audit; this client never falls
 * back to a Web database write after its caller selects the canary.
 */
export async function commitCadEvidenceThroughCoreApi(
  documentId: string,
  command: CadEvidenceCommitCommand,
  idempotencyKey: string,
  expectedTenantId: string
): Promise<CoreResult<CadEvidenceCommitResult>> {
  const parsedCommand = cadEvidenceCommitCommandSchema.safeParse(command)
  if (!parsedCommand.success) {
    return {
      ok: false,
      error: 'Invalid CAD evidence command.',
      status: 400,
    }
  }
  try {
    parseCadWorkerResponse(parsedCommand.data.workerResponse, documentId)
  } catch {
    return {
      ok: false,
      error: 'Invalid CAD evidence command.',
      status: 400,
    }
  }

  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/documents/${encodeURIComponent(documentId)}/cad-evidence`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(parsedCommand.data),
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
            ? 'CAD evidence conflicts with an existing command.'
            : response.status === 404
              ? 'CAD document was not found.'
              : 'CAD evidence was not committed.'
      return { ok: false, error: detail, status: response.status }
    }

    const parsed = cadEvidenceCommitResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid CAD evidence result.',
        status: 502,
      }
    }
    if (
      parsed.data.documentId !== documentId ||
      parsed.data.projectId !== parsedCommand.data.projectId ||
      parsed.data.tenantId !== expectedTenantId
    ) {
      return {
        ok: false,
        error: 'ERP Core API returned a mismatched CAD evidence result.',
        status: 502,
      }
    }
    return { ok: true, data: parsed.data, status: response.status }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No CAD evidence was committed.',
      status: 503,
    }
  }
}

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

export async function createCustomerInvoiceDraftThroughCoreApi(
  projectId: string,
  command: CustomerInvoiceDraftCreateBody,
  idempotencyKey: string
): Promise<CoreResult<CustomerInvoiceDraftCreateResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${encodeURIComponent(
        projectId
      )}/customer-invoices`,
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
            ? 'Customer invoice draft conflicts with the current project or BOM.'
            : response.status === 404
              ? 'Project or BOM was not found.'
              : 'Customer invoice draft was not created.'
      return { ok: false, error: message }
    }
    const parsed = customerInvoiceDraftCreateResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid customer invoice draft result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No customer invoice draft was created.',
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
