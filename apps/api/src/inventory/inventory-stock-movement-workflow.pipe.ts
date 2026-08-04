import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  stockMovementPostCommandSchema,
  stockMovementReverseCommandSchema,
  type StockMovementPostCommand,
  type StockMovementReverseCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class InventoryStockMovementPostPipe
  implements PipeTransform<unknown, StockMovementPostCommand>
{
  transform(value: unknown): StockMovementPostCommand {
    const parsed = stockMovementPostCommandSchema.safeParse(value ?? {})
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Stock Movement posting command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class InventoryStockMovementReversePipe
  implements PipeTransform<unknown, StockMovementReverseCommand>
{
  transform(value: unknown): StockMovementReverseCommand {
    const parsed = stockMovementReverseCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Stock Movement reversal command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
