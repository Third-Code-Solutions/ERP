import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common'
import {
  deliveryStartSitePreparationCommandSchema,
  type DeliveryStartSitePreparationCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DeliverySitePreparationStartPipe
  implements PipeTransform<unknown, DeliveryStartSitePreparationCommand>
{
  transform(value: unknown, _metadata: ArgumentMetadata) {
    const parsed = deliveryStartSitePreparationCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException('Invalid delivery site-preparation command')
    }
    return parsed.data
  }
}
