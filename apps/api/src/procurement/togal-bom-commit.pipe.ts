import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  togalBomCommitCommandSchema,
  type TogalBomCommitCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class TogalBomCommitPipe
  implements PipeTransform<unknown, TogalBomCommitCommand>
{
  transform(value: unknown): TogalBomCommitCommand {
    const parsed = togalBomCommitCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Togal BOM commit command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
