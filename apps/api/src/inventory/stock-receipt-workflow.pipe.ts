import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  stockReceiptPostCommandSchema,
  stockReceiptReverseCommandSchema,
  type StockReceiptPostCommand,
  type StockReceiptReverseCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class StockReceiptPostPipe
  implements PipeTransform<unknown, StockReceiptPostCommand>
{
  transform(value: unknown): StockReceiptPostCommand {
    const parsed = stockReceiptPostCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Stock Receipt posting command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class StockReceiptReversePipe
  implements PipeTransform<unknown, StockReceiptReverseCommand>
{
  transform(value: unknown): StockReceiptReverseCommand {
    const parsed = stockReceiptReverseCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Stock Receipt reversal command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
