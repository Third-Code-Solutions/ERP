import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  inspectionPhotoCommandSchema,
  type InspectionPhotoCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class InspectionPhotoPipe
  implements PipeTransform<unknown, InspectionPhotoCommand>
{
  transform(value: unknown): InspectionPhotoCommand {
    const parsed = inspectionPhotoCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid inspection photo command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
