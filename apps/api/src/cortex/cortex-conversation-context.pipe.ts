import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexConversationContextResolveQuerySchema,
  type CortexConversationContextResolveQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexConversationContextPipe
  implements PipeTransform<unknown, CortexConversationContextResolveQuery>
{
  transform(value: unknown): CortexConversationContextResolveQuery {
    const parsed = cortexConversationContextResolveQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex conversation context query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
