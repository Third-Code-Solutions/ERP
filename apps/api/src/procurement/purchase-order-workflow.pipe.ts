import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  purchaseOrderWorkflowCommandSchema,
  type PurchaseOrderWorkflowCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class PurchaseOrderWorkflowPipe
  implements PipeTransform<unknown, PurchaseOrderWorkflowCommand>
{
  transform(value: unknown): PurchaseOrderWorkflowCommand {
    const parsed = purchaseOrderWorkflowCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Purchase Order workflow command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
