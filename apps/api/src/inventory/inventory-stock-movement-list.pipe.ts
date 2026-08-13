import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  inventoryStockMovementListQuerySchema,
  type InventoryStockMovementListQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class InventoryStockMovementListPipe
  implements PipeTransform<unknown, InventoryStockMovementListQuery>
{
  transform(value: unknown): InventoryStockMovementListQuery {
    const parsed = inventoryStockMovementListQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Stock Movement list query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
