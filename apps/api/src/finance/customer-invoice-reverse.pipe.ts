import { BadRequestException, type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common'
import {
  customerInvoiceReverseBodySchema,
  type CustomerInvoiceReverseBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class CustomerInvoiceReversePipe
  implements PipeTransform<unknown, CustomerInvoiceReverseBody>
{
  transform(value: unknown, _metadata: ArgumentMetadata): CustomerInvoiceReverseBody {
    const parsed = customerInvoiceReverseBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid customer invoice reversal command',
        issues: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
