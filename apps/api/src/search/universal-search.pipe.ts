import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  universalSearchQuerySchema,
  type UniversalSearchQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class UniversalSearchPipe
  implements PipeTransform<unknown, UniversalSearchQuery>
{
  transform(value: unknown): UniversalSearchQuery {
    const parsed = universalSearchQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid universal search query',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
