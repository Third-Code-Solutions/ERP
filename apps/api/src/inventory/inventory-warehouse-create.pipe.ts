import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createInventoryWarehouseCommandSchema,
  type CreateInventoryWarehouseCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class InventoryWarehouseCreatePipe
  implements PipeTransform<unknown, CreateInventoryWarehouseCommand>
{
  transform(value: unknown): CreateInventoryWarehouseCommand {
    const parsed = createInventoryWarehouseCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid inventory Warehouse creation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
