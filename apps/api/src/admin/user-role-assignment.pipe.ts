import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  userRoleAssignmentCommandSchema,
  type UserRoleAssignmentCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class UserRoleAssignmentPipe
  implements PipeTransform<unknown, UserRoleAssignmentCommand>
{
  transform(value: unknown): UserRoleAssignmentCommand {
    const parsed = userRoleAssignmentCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid user role assignment',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
