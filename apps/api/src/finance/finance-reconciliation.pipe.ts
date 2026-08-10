import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  financeReconciliationQuerySchema,
  type FinanceReconciliationQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class FinanceReconciliationPipe
  implements PipeTransform<unknown, FinanceReconciliationQuery>
{
  transform(value: unknown): FinanceReconciliationQuery {
    const parsed = financeReconciliationQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid bank reconciliation query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
