import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  supplierBillReverseBodySchema,
  type SupplierBillReverseBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class SupplierBillReversePipe
  implements PipeTransform<unknown, SupplierBillReverseBody>
{
  transform(value: unknown): SupplierBillReverseBody {
    const parsed = supplierBillReverseBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Supplier Bill reversal command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
