import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexConversationIdSchema,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexConversationIdPipe
  implements PipeTransform<unknown, string>
{
  transform(value: unknown): string {
    const parsed = cortexConversationIdSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException('Invalid Cortex conversation id.')
    }
    return parsed.data
  }
}

export function cortexConversationTimestamp(value: unknown): string {
  const timestamp = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError('Invalid Cortex conversation timestamp')
  }
  return timestamp.toISOString()
}
