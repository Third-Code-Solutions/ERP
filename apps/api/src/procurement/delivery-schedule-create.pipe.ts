import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common'
import {
  createDeliveryScheduleCommandSchema,
  type CreateDeliveryScheduleCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DeliveryScheduleCreatePipe
  implements PipeTransform<unknown, CreateDeliveryScheduleCommand>
{
  transform(value: unknown, _metadata: ArgumentMetadata) {
    const parsed = createDeliveryScheduleCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException('Invalid delivery schedule command')
    }
    return parsed.data
  }
}
