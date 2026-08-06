import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  type UpdateInventoryUomCommand,
  updateInventoryUomCommandSchema,
} from '@third-code-erp/shared-types'

@Injectable()
export class InventoryUomUpdatePipe
  implements PipeTransform<unknown, UpdateInventoryUomCommand>
{
  transform(value: unknown): UpdateInventoryUomCommand {
    const parsed = updateInventoryUomCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid inventory UOM update command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
