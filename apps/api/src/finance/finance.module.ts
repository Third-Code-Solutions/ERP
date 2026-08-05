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
import { FinanceLedgerController } from './finance-ledger.controller'
import { FinanceLedgerService } from './finance-ledger.service'
import { FinanceReceivablesController } from './finance-receivables.controller'
import { FinanceReceivablesService } from './finance-receivables.service'
import { FinancePayablesController } from './finance-payables.controller'
import { FinancePayablesService } from './finance-payables.service'

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
    FinanceLedgerController,
    FinanceReceivablesController,
    FinancePayablesController,
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
    FinanceLedgerService,
    FinanceReceivablesService,
    FinancePayablesService,
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
        FinanceLedgerController,
        FinanceReceivablesController,
        FinancePayablesController
      )
  }
}
