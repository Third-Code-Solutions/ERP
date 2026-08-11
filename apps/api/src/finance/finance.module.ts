import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { JournalPostController } from './journal-post.controller'
import { JournalPostService } from './journal-post.service'
import { JournalReverseController } from './journal-reverse.controller'
import { JournalReverseService } from './journal-reverse.service'
import { SupplierBillPostController } from './supplier-bill-post.controller'
import { SupplierBillPostService } from './supplier-bill-post.service'
import { SupplierBillReverseController } from './supplier-bill-reverse.controller'
import { SupplierBillReverseService } from './supplier-bill-reverse.service'
import { CashTransactionWorkflowController } from './cash-transaction-workflow.controller'
import { CashTransactionWorkflowService } from './cash-transaction-workflow.service'
import { CashDraftController } from './cash-draft.controller'
import { CashDraftService } from './cash-draft.service'
import { CustomerInvoiceIssueController } from './customer-invoice-issue.controller'
import { CustomerInvoiceIssueService } from './customer-invoice-issue.service'
import { CustomerInvoiceReverseController } from './customer-invoice-reverse.controller'
import { CustomerInvoiceReverseService } from './customer-invoice-reverse.service'
import { CustomerInvoiceCancelController } from './customer-invoice-cancel.controller'
import { CustomerInvoiceCancelService } from './customer-invoice-cancel.service'
import { CustomerInvoiceDraftCreateController } from './customer-invoice-draft-create.controller'
import { CustomerInvoiceDraftCreateService } from './customer-invoice-draft-create.service'
import { FinanceLedgerController } from './finance-ledger.controller'
import { FinanceLedgerService } from './finance-ledger.service'
import { FinanceReceivablesController } from './finance-receivables.controller'
import { FinanceReceivablesService } from './finance-receivables.service'
import { FinancePayablesController } from './finance-payables.controller'
import { FinancePayablesService } from './finance-payables.service'
import { FinanceCashController } from './finance-cash.controller'
import { FinanceCashService } from './finance-cash.service'
import { FinanceReconciliationController } from './finance-reconciliation.controller'
import { FinanceReconciliationService } from './finance-reconciliation.service'
import { FinanceReconciliationWorkflowController } from './finance-reconciliation-workflow.controller'
import { FinanceReconciliationWorkflowService } from './finance-reconciliation-workflow.service'

@Module({
  imports: [AuditModule],
  controllers: [
    JournalPostController,
    JournalReverseController,
    SupplierBillPostController,
    SupplierBillReverseController,
    CashTransactionWorkflowController,
    CashDraftController,
    CustomerInvoiceIssueController,
    CustomerInvoiceReverseController,
    CustomerInvoiceCancelController,
    CustomerInvoiceDraftCreateController,
    FinanceLedgerController,
    FinanceReceivablesController,
    FinancePayablesController,
    FinanceCashController,
    FinanceReconciliationController,
    FinanceReconciliationWorkflowController,
  ],
  providers: [
    JournalPostService,
    JournalReverseService,
    SupplierBillPostService,
    SupplierBillReverseService,
    CashTransactionWorkflowService,
    CashDraftService,
    CustomerInvoiceIssueService,
    CustomerInvoiceReverseService,
    CustomerInvoiceCancelService,
    CustomerInvoiceDraftCreateService,
    FinanceLedgerService,
    FinanceReceivablesService,
    FinancePayablesService,
    FinanceCashService,
    FinanceReconciliationService,
    FinanceReconciliationWorkflowService,
  ],
})
export class FinanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        JournalPostController,
        JournalReverseController,
        SupplierBillPostController,
        SupplierBillReverseController,
        CashTransactionWorkflowController,
        CashDraftController,
        CustomerInvoiceIssueController,
        CustomerInvoiceReverseController,
        CustomerInvoiceCancelController,
        CustomerInvoiceDraftCreateController,
        FinanceLedgerController,
        FinanceReceivablesController,
        FinancePayablesController,
        FinanceCashController,
        FinanceReconciliationController,
        FinanceReconciliationWorkflowController
      )
  }
}
