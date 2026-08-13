import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  configureInventoryItemCommandSchema,
  type ConfigureInventoryItemCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class InventoryItemConfigurationPipe
  implements PipeTransform<unknown, ConfigureInventoryItemCommand>
{
  transform(value: unknown): ConfigureInventoryItemCommand {
    const parsed = configureInventoryItemCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid inventory item configuration command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
