import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  transitionRfqCommandSchema,
  type TransitionRfqCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class TransitionRfqPipe
  implements PipeTransform<unknown, TransitionRfqCommand>
{
  transform(value: unknown): TransitionRfqCommand {
    const parsed = transitionRfqCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid RFQ transition',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
