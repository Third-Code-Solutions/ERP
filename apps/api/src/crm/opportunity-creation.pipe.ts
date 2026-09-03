import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  opportunityCreationCommandSchema,
  type OpportunityCreationCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class OpportunityCreationPipe
  implements PipeTransform<unknown, OpportunityCreationCommand>
{
  transform(value: unknown): OpportunityCreationCommand {
    const parsed = opportunityCreationCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid opportunity creation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
