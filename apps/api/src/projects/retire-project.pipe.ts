import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  retireProjectCommandSchema,
  type RetireProjectCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class RetireProjectPipe
  implements PipeTransform<unknown, RetireProjectCommand>
{
  transform(value: unknown): RetireProjectCommand {
    const parsed = retireProjectCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid project retirement command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
