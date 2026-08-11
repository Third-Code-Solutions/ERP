import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  bankStatementAutoMatchBodySchema,
  bankStatementLineMatchBodySchema,
  bankStatementLineUnmatchBodySchema,
  bankStatementReconcileBodySchema,
  bankStatementVoidBodySchema,
  type BankStatementAutoMatchBody,
  type BankStatementLineMatchBody,
  type BankStatementLineUnmatchBody,
  type BankStatementReconcileBody,
  type BankStatementVoidBody,
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
