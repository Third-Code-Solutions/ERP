import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  opportunityStageTransitionCommandSchema,
  type OpportunityStageTransitionCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class OpportunityStageTransitionPipe
  implements PipeTransform<unknown, OpportunityStageTransitionCommand>
{
  transform(value: unknown): OpportunityStageTransitionCommand {
    const parsed = opportunityStageTransitionCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid opportunity stage transition command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
