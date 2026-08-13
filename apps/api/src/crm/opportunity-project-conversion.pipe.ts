import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  opportunityProjectConversionCommandSchema,
  type OpportunityProjectConversionCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class OpportunityProjectConversionPipe
  implements PipeTransform<unknown, OpportunityProjectConversionCommand>
{
  transform(value: unknown): OpportunityProjectConversionCommand {
    const parsed = opportunityProjectConversionCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid opportunity project conversion command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
