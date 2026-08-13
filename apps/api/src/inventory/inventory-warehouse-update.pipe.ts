import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  type UpdateInventoryWarehouseCommand,
  updateInventoryWarehouseCommandSchema,
} from '@third-code-erp/shared-types'

@Injectable()
export class InventoryWarehouseUpdatePipe
  implements PipeTransform<unknown, UpdateInventoryWarehouseCommand>
{
  transform(value: unknown): UpdateInventoryWarehouseCommand {
    const parsed = updateInventoryWarehouseCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid inventory Warehouse update command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
