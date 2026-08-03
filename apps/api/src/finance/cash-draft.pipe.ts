import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  cashTransactionDraftBodySchema,
  cashTransactionDraftDeleteBodySchema,
  type CashTransactionDraftBody,
  type CashTransactionDraftDeleteBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class CashTransactionDraftPipe
  implements PipeTransform<unknown, CashTransactionDraftBody>
{
  transform(value: unknown): CashTransactionDraftBody {
    const parsed = cashTransactionDraftBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid cash draft command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class CashTransactionDraftDeletePipe
  implements PipeTransform<unknown, CashTransactionDraftDeleteBody>
{
  transform(value: unknown): CashTransactionDraftDeleteBody {
    const parsed = cashTransactionDraftDeleteBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid cash draft deletion command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
