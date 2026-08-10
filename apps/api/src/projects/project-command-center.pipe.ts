import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  projectCommandCenterQuerySchema,
  type ProjectCommandCenterQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class ProjectCommandCenterPipe
  implements PipeTransform<unknown, ProjectCommandCenterQuery>
{
  transform(value: unknown): ProjectCommandCenterQuery {
    const parsed = projectCommandCenterQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid project command center query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
