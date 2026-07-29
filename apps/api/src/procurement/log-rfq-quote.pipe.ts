import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  logRfqQuoteCommandSchema,
  type LogRfqQuoteCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class LogRfqQuotePipe
  implements PipeTransform<unknown, LogRfqQuoteCommand>
{
  transform(value: unknown): LogRfqQuoteCommand {
    const parsed = logRfqQuoteCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid RFQ quote',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
