import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  dailyTaskCompletionCommandSchema,
  type DailyTaskCompletionCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DailyTaskCompletionPipe
  implements PipeTransform<unknown, DailyTaskCompletionCommand>
{
  transform(value: unknown): DailyTaskCompletionCommand {
    const parsed = dailyTaskCompletionCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid daily task completion command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
