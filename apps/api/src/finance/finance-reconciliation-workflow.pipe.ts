import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  bankStatementAutoMatchBodySchema,
  bankStatementLineMatchBodySchema,
  bankStatementLineUnmatchBodySchema,
  type BankStatementAutoMatchBody,
  type BankStatementLineMatchBody,
  type BankStatementLineUnmatchBody,
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
