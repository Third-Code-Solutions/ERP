import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  financeLedgerQuerySchema,
  type FinanceLedgerQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class FinanceLedgerPipe
  implements PipeTransform<unknown, FinanceLedgerQuery>
{
  transform(value: unknown): FinanceLedgerQuery {
    const parsed = financeLedgerQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid finance ledger query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
