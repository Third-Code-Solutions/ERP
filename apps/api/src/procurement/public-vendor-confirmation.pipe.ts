import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  vendorConfirmationBodySchema,
  type VendorConfirmationBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class PublicVendorConfirmationPipe
  implements PipeTransform<unknown, VendorConfirmationBody>
{
  transform(value: unknown): VendorConfirmationBody {
    const parsed = vendorConfirmationBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid supplier confirmation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
