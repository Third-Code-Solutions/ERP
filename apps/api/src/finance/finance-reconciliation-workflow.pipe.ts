import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  bankStatementAutoMatchBodySchema,
  type BankStatementAutoMatchBody,
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
