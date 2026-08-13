import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  deleteCostEntryBodySchema,
  type DeleteCostEntryBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class DeleteCostEntryPipe
  implements PipeTransform<unknown, DeleteCostEntryBody>
{
  transform(value: unknown): DeleteCostEntryBody {
    const parsed = deleteCostEntryBodySchema.safeParse(value ?? {})
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid cost entry deletion command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
