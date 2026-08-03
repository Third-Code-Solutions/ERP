import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  supplierBillPostCommandSchema,
  type SupplierBillPostCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class SupplierBillPostPipe
  implements PipeTransform<unknown, SupplierBillPostCommand>
{
  transform(value: unknown): SupplierBillPostCommand {
    const parsed = supplierBillPostCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Supplier Bill posting command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
