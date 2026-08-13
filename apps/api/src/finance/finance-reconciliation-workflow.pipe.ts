import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  bankStatementAutoMatchBodySchema,
  bankStatementLineMatchBodySchema,
  bankStatementLineUnmatchBodySchema,
  bankStatementReconcileBodySchema,
  bankStatementVoidBodySchema,
  bankStatementImportBodySchema,
  bankStatementImportStorageCleanupBodySchema,
  bankStatementImportUploadSignBodySchema,
  type BankStatementAutoMatchBody,
  type BankStatementLineMatchBody,
  type BankStatementLineUnmatchBody,
  type BankStatementReconcileBody,
  type BankStatementVoidBody,
  type BankStatementImportBody,
  type BankStatementImportStorageCleanupBody,
  type BankStatementImportUploadSignBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class FinanceReconciliationAutoMatchPipe
  implements PipeTransform<unknown, BankStatementAutoMatchBody>
{
  transform(value: unknown): BankStatementAutoMatchBody {
    const parsed = bankStatementAutoMatchBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid bank statement auto-match command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class FinanceReconciliationLineMatchPipe
  implements PipeTransform<unknown, BankStatementLineMatchBody>
{
  transform(value: unknown): BankStatementLineMatchBody {
    const parsed = bankStatementLineMatchBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid bank statement line match command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class FinanceReconciliationLineUnmatchPipe
  implements PipeTransform<unknown, BankStatementLineUnmatchBody>
{
  transform(value: unknown): BankStatementLineUnmatchBody {
    const parsed = bankStatementLineUnmatchBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid bank statement line unmatch command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class FinanceReconciliationReconcilePipe
  implements PipeTransform<unknown, BankStatementReconcileBody>
{
  transform(value: unknown): BankStatementReconcileBody {
    const parsed = bankStatementReconcileBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid bank statement reconcile command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class FinanceReconciliationVoidPipe
  implements PipeTransform<unknown, BankStatementVoidBody>
{
  transform(value: unknown): BankStatementVoidBody {
    const parsed = bankStatementVoidBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid bank statement void command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class FinanceReconciliationImportPipe
  implements PipeTransform<unknown, BankStatementImportBody>
{
  transform(value: unknown): BankStatementImportBody {
    const parsed = bankStatementImportBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid bank statement import command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class FinanceReconciliationStorageSignPipe
  implements PipeTransform<unknown, BankStatementImportUploadSignBody>
{
  transform(value: unknown): BankStatementImportUploadSignBody {
    const parsed = bankStatementImportUploadSignBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid bank statement upload request',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class FinanceReconciliationStorageCleanupPipe
  implements PipeTransform<unknown, BankStatementImportStorageCleanupBody>
{
  transform(value: unknown): BankStatementImportStorageCleanupBody {
    const parsed = bankStatementImportStorageCleanupBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid bank statement storage path',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
