import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexGraphQuerySchema,
  type CortexGraphQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexGraphPipe implements PipeTransform<unknown, CortexGraphQuery> {
  transform(value: unknown): CortexGraphQuery {
    const parsed = cortexGraphQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex graph focus',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
