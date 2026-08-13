import {
  BadRequestException,
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  customerInvoiceCancelBodySchema,
  type CustomerInvoiceCancelBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class CustomerInvoiceCancelPipe
  implements PipeTransform<unknown, CustomerInvoiceCancelBody>
{
  transform(
    value: unknown,
    _metadata: ArgumentMetadata
  ): CustomerInvoiceCancelBody {
    const parsed = customerInvoiceCancelBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid customer invoice cancellation command',
        issues: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
