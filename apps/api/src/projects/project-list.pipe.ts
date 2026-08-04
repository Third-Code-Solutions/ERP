import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  projectListQuerySchema,
  type ProjectListQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class ProjectListPipe
  implements PipeTransform<unknown, ProjectListQuery>
{
  transform(value: unknown): ProjectListQuery {
    const parsed = projectListQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid project list query',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
