import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createStockReceiptCommandSchema,
  type CreateStockReceiptCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class StockReceiptCreatePipe
  implements PipeTransform<unknown, CreateStockReceiptCommand>
{
  transform(value: unknown): CreateStockReceiptCommand {
    const parsed = createStockReceiptCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Stock Receipt creation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
