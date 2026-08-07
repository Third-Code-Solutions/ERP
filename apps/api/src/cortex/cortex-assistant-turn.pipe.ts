import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexConversationAssistantTurnClaimCommandSchema,
  cortexConversationAssistantTurnCompleteCommandSchema,
  type CortexConversationAssistantTurnClaimCommand,
  type CortexConversationAssistantTurnCompleteCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexAssistantTurnClaimPipe
  implements PipeTransform<unknown, CortexConversationAssistantTurnClaimCommand>
{
  transform(value: unknown): CortexConversationAssistantTurnClaimCommand {
    const parsed =
      cortexConversationAssistantTurnClaimCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex assistant-turn claim',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class CortexAssistantTurnCompletePipe
  implements
    PipeTransform<unknown, CortexConversationAssistantTurnCompleteCommand>
{
  transform(value: unknown): CortexConversationAssistantTurnCompleteCommand {
    const parsed =
      cortexConversationAssistantTurnCompleteCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex assistant-turn completion',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
