import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  financeReceivablesQuerySchema,
  type FinanceReceivablesQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class FinanceReceivablesPipe
  implements PipeTransform<unknown, FinanceReceivablesQuery>
{
  transform(value: unknown): FinanceReceivablesQuery {
    const parsed = financeReceivablesQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid customer receivables query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
