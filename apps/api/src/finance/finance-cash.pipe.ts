import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  financeCashQuerySchema,
  type FinanceCashQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class FinanceCashPipe implements PipeTransform<unknown, FinanceCashQuery> {
  transform(value: unknown): FinanceCashQuery {
    const parsed = financeCashQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid cash transaction register query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
