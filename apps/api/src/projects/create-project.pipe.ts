import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createProjectCommandSchema,
  type CreateProjectCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CreateProjectPipe
  implements PipeTransform<unknown, CreateProjectCommand>
{
  transform(value: unknown): CreateProjectCommand {
    const parsed = createProjectCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid project creation',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
