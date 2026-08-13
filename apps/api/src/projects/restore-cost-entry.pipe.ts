import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  restoreCostEntryBodySchema,
  type RestoreCostEntryBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class RestoreCostEntryPipe
  implements PipeTransform<unknown, RestoreCostEntryBody>
{
  transform(value: unknown): RestoreCostEntryBody {
    const parsed = restoreCostEntryBodySchema.safeParse(value ?? {})
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid cost entry restore command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
