import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  takeoffImportCommandSchema,
  type TakeoffImportCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class TakeoffImportPipe
  implements PipeTransform<unknown, TakeoffImportCommand>
{
  transform(value: unknown): TakeoffImportCommand {
    const parsed = takeoffImportCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid takeoff import command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
