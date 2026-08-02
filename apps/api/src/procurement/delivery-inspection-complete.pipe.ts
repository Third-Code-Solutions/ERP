import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common'
import {
  deliveryInspectionCompleteCommandSchema,
  type DeliveryInspectionCompleteCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DeliveryInspectionCompletePipe
  implements PipeTransform<unknown, DeliveryInspectionCompleteCommand>
{
  transform(value: unknown, _metadata: ArgumentMetadata) {
    const parsed = deliveryInspectionCompleteCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException('Invalid delivery inspection completion command')
    }
    return parsed.data
  }
}
