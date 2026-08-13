import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  createProjectCommentCommandSchema,
  type CreateProjectCommentCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CreateProjectCommentPipe
  implements PipeTransform<unknown, CreateProjectCommentCommand>
{
  transform(value: unknown): CreateProjectCommentCommand {
    const parsed = createProjectCommentCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid project comment command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
