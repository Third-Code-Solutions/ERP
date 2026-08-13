import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexEntityParamsSchema,
  type CortexEntityParams,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexEntityPipe
  implements PipeTransform<unknown, CortexEntityParams>
{
  transform(value: unknown): CortexEntityParams {
    const parsed = cortexEntityParamsSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex entity reference',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
