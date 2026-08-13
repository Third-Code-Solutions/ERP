import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common'
import type {
  BankStatementImportStorageCleanupBody,
  BankStatementImportStorageCleanupResult,
  BankStatementImportUploadSignBody,
  BankStatementImportUploadSignResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  FinanceReconciliationStorageCleanupPipe,
  FinanceReconciliationStorageSignPipe,
} from './finance-reconciliation-workflow.pipe'
import { BankStatementImportStorageAuthorityService } from './bank-statement-import-storage-authority.service'

@Controller('v1/finance/reconciliation/import/storage')
export class FinanceReconciliationStorageController {
  constructor(
    @Inject(BankStatementImportStorageAuthorityService)
    private readonly storage: BankStatementImportStorageAuthorityService
  ) {}

  @Post('sign')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage_cash')
  sign(
    @Body(FinanceReconciliationStorageSignPipe)
    body: BankStatementImportUploadSignBody,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<BankStatementImportUploadSignResult> {
    return this.storage.createSignedUpload(body, principal)
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage_cash')
  cleanup(
    @Body(FinanceReconciliationStorageCleanupPipe)
    body: BankStatementImportStorageCleanupBody,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<BankStatementImportStorageCleanupResult> {
    return this.storage.cleanup(body, principal)
  }
}
