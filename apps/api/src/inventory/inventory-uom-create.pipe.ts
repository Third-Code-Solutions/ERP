import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createInventoryUomCommandSchema,
  type CreateInventoryUomCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class InventoryUomCreatePipe
  implements PipeTransform<unknown, CreateInventoryUomCommand>
{
  transform(value: unknown): CreateInventoryUomCommand {
    const parsed = createInventoryUomCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid inventory UOM creation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
