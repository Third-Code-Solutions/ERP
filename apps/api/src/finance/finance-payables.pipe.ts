import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  financePayablesQuerySchema,
  type FinancePayablesQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class FinancePayablesPipe
  implements PipeTransform<unknown, FinancePayablesQuery>
{
  transform(value: unknown): FinancePayablesQuery {
    const parsed = financePayablesQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid supplier payables query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
