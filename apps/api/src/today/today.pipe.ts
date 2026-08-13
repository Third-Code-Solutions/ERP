import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  todayQuerySchema,
  type TodayQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class TodayPipe implements PipeTransform<unknown, TodayQuery> {
  transform(value: unknown): TodayQuery {
    const parsed = todayQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Today query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
