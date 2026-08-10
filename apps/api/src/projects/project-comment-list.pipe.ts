import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  projectCommentListQuerySchema,
  type ProjectCommentListQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class ProjectCommentListPipe
  implements PipeTransform<unknown, ProjectCommentListQuery>
{
  transform(value: unknown): ProjectCommentListQuery {
    const parsed = projectCommentListQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid project comment list query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
