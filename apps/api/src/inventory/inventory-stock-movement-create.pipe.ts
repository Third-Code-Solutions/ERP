import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createStockMovementCommandSchema,
  type CreateStockMovementCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class InventoryStockMovementCreatePipe
  implements PipeTransform<unknown, CreateStockMovementCommand>
{
  transform(value: unknown): CreateStockMovementCommand {
    const parsed = createStockMovementCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Stock Movement creation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
