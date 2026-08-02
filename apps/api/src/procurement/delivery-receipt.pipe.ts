import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  deliveryReceiptCommandSchema,
  type DeliveryReceiptCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DeliveryReceiptPipe
  implements PipeTransform<unknown, DeliveryReceiptCommand>
{
  transform(value: unknown): DeliveryReceiptCommand {
    const parsed = deliveryReceiptCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid delivery receipt command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
