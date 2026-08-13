import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  createChangeRequestCommandSchema,
  type CreateChangeRequestCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CreateChangeRequestPipe
  implements PipeTransform<unknown, CreateChangeRequestCommand>
{
  transform(value: unknown): CreateChangeRequestCommand {
    const parsed = createChangeRequestCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Change Request creation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
