import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexSearchQuerySchema,
  type CortexSearchQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexSearchPipe
  implements PipeTransform<unknown, CortexSearchQuery>
{
  transform(value: unknown): CortexSearchQuery {
    const parsed = cortexSearchQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex search query',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
