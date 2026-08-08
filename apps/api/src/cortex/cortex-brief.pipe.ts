import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexBriefQuerySchema,
  type CortexBriefQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexBriefPipe
  implements PipeTransform<unknown, CortexBriefQuery>
{
  transform(value: unknown): CortexBriefQuery {
    const parsed = cortexBriefQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex brief query',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
