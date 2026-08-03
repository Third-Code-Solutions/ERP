import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  publicSigningBodySchema,
  type PublicSigningBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class PublicSigningPipe
  implements PipeTransform<unknown, PublicSigningBody>
{
  transform(value: unknown): PublicSigningBody {
    const parsed = publicSigningBodySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid public signing command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
