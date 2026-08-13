import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  journalReverseBodySchema,
  type JournalReverseBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class JournalReversePipe
  implements PipeTransform<unknown, JournalReverseBody>
{
  transform(value: unknown): JournalReverseBody {
    const parsed = journalReverseBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid journal reversal command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
