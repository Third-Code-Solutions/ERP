import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common'
import {
  deliveryMarkInTransitCommandSchema,
  type DeliveryMarkInTransitCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DeliveryMarkInTransitPipe
  implements PipeTransform<unknown, DeliveryMarkInTransitCommand>
{
  transform(value: unknown, _metadata: ArgumentMetadata) {
    const parsed = deliveryMarkInTransitCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException('Invalid delivery in-transit command')
    }
    return parsed.data
  }
}
