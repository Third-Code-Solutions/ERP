import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  createCostEntryCommandSchema,
  type CreateCostEntryCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CreateCostEntryPipe
  implements PipeTransform<unknown, CreateCostEntryCommand>
{
  transform(value: unknown): CreateCostEntryCommand {
    const parsed = createCostEntryCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid cost entry creation',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
