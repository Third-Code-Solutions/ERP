import {
  BadRequestException,
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  deliveryCancelCommandSchema,
  type DeliveryCancelCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DeliveryCancelPipe
  implements PipeTransform<unknown, DeliveryCancelCommand>
{
  transform(value: unknown, _metadata: ArgumentMetadata): DeliveryCancelCommand {
    const parsed = deliveryCancelCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException('Invalid delivery cancellation command')
    }
    return parsed.data
  }
}
