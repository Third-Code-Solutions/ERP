import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  customerInvoiceIssueCommandSchema,
  type CustomerInvoiceIssueCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CustomerInvoiceIssuePipe
  implements PipeTransform<unknown, CustomerInvoiceIssueCommand>
{
  transform(value: unknown): CustomerInvoiceIssueCommand {
    const parsed = customerInvoiceIssueCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid customer invoice issuance command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
