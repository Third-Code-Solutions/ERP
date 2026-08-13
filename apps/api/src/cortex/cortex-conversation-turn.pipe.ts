import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexConversationUserTurnCommandSchema,
  type CortexConversationUserTurnCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexConversationTurnPipe
  implements PipeTransform<unknown, CortexConversationUserTurnCommand>
{
  transform(value: unknown): CortexConversationUserTurnCommand {
    const parsed = cortexConversationUserTurnCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex user turn',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
