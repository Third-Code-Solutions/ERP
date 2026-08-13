import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createPurchaseOrderCommandSchema,
  type CreatePurchaseOrderCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CreatePurchaseOrderPipe
  implements PipeTransform<unknown, CreatePurchaseOrderCommand>
{
  transform(value: unknown): CreatePurchaseOrderCommand {
    const parsed = createPurchaseOrderCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Purchase Order creation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
