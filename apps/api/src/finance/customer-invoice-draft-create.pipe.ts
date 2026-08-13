import {
  BadRequestException,
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  customerInvoiceDraftCreateBodySchema,
  type CustomerInvoiceDraftCreateBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class CustomerInvoiceDraftCreatePipe
  implements PipeTransform<unknown, CustomerInvoiceDraftCreateBody>
{
  transform(
    value: unknown,
    _metadata: ArgumentMetadata
  ): CustomerInvoiceDraftCreateBody {
    const parsed = customerInvoiceDraftCreateBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid customer invoice draft command',
        issues: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
