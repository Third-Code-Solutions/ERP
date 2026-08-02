import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createPurchaseOrdersGroupedFromBomCommandSchema,
  type CreatePurchaseOrdersGroupedFromBomCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CreatePurchaseOrdersGroupedFromBomPipe
  implements PipeTransform<unknown, CreatePurchaseOrdersGroupedFromBomCommand>
{
  transform(value: unknown): CreatePurchaseOrdersGroupedFromBomCommand {
    const parsed = createPurchaseOrdersGroupedFromBomCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid grouped BOM Purchase Order creation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
