import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  updateProjectCommandSchema,
  type UpdateProjectCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class UpdateProjectPipe
  implements PipeTransform<unknown, UpdateProjectCommand>
{
  transform(value: unknown): UpdateProjectCommand {
    const parsed = updateProjectCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid project update',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
