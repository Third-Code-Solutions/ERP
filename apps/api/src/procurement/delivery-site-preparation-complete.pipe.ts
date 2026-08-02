import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common'
import {
  deliveryCompleteSitePreparationCommandSchema,
  type DeliveryCompleteSitePreparationCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DeliverySitePreparationCompletePipe
  implements PipeTransform<unknown, DeliveryCompleteSitePreparationCommand>
{
  transform(value: unknown, _metadata: ArgumentMetadata) {
    const parsed = deliveryCompleteSitePreparationCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException(
        'Invalid delivery site-preparation completion command'
      )
    }
    return parsed.data
  }
}
