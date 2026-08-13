import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  cashTransactionPostBodySchema,
  cashTransactionReverseBodySchema,
  type CashTransactionPostBody,
  type CashTransactionReverseBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class CashTransactionPostPipe
  implements PipeTransform<unknown, CashTransactionPostBody>
{
  transform(value: unknown): CashTransactionPostBody {
    const parsed = cashTransactionPostBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid cash transaction posting command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class CashTransactionReversePipe
  implements PipeTransform<unknown, CashTransactionReverseBody>
{
  transform(value: unknown): CashTransactionReverseBody {
    const parsed = cashTransactionReverseBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid cash transaction reversal command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
