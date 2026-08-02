import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common'
import {
  deliveryStartInspectionCommandSchema,
  type DeliveryStartInspectionCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DeliveryStartInspectionPipe
  implements PipeTransform<unknown, DeliveryStartInspectionCommand>
{
  transform(value: unknown, _metadata: ArgumentMetadata) {
    const parsed = deliveryStartInspectionCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException('Invalid delivery inspection command')
    }
    return parsed.data
  }
}
