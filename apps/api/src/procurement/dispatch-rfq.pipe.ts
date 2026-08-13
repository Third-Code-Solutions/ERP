import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createRfqCommandSchema,
  type CreateRfqCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DispatchRfqPipe
  implements PipeTransform<unknown, CreateRfqCommand>
{
  transform(value: unknown): CreateRfqCommand {
    const parsed = createRfqCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid RFQ dispatch command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
