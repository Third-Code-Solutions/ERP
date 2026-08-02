import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createPurchaseOrderFromBomCommandSchema,
  type CreatePurchaseOrderFromBomCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CreatePurchaseOrderFromBomPipe
  implements PipeTransform<unknown, CreatePurchaseOrderFromBomCommand>
{
  transform(value: unknown): CreatePurchaseOrderFromBomCommand {
    const parsed = createPurchaseOrderFromBomCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid BOM Purchase Order creation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
