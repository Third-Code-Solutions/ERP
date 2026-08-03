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
import { CustomerInvoiceIssueController } from './customer-invoice-issue.controller'
import { CustomerInvoiceIssueService } from './customer-invoice-issue.service'
import { CustomerInvoiceReverseController } from './customer-invoice-reverse.controller'
import { CustomerInvoiceReverseService } from './customer-invoice-reverse.service'

@Module({
  imports: [AuditModule],
  controllers: [
    JournalPostController,
    JournalReverseController,
    SupplierBillPostController,
    SupplierBillReverseController,
    CashTransactionWorkflowController,
    CustomerInvoiceIssueController,
    CustomerInvoiceReverseController,
  ],
  providers: [
    JournalPostService,
    JournalReverseService,
    SupplierBillPostService,
    SupplierBillReverseService,
    CashTransactionWorkflowService,
    CustomerInvoiceIssueService,
    CustomerInvoiceReverseService,
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
        CustomerInvoiceIssueController,
        CustomerInvoiceReverseController
      )
  }
}
