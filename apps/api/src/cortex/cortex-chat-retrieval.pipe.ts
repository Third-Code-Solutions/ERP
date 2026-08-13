import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexChatRetrievalQuerySchema,
  type CortexChatRetrievalQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexChatRetrievalPipe
  implements PipeTransform<unknown, CortexChatRetrievalQuery>
{
  transform(value: unknown): CortexChatRetrievalQuery {
    const parsed = cortexChatRetrievalQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex chat retrieval query',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
