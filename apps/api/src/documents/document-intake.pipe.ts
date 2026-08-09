import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  documentIntakeRequestSchema,
  type DocumentIntakeRequest,
} from '@third-code-erp/shared-types'

@Injectable()
export class DocumentIntakePipe
  implements PipeTransform<unknown, DocumentIntakeRequest>
{
  transform(value: unknown): DocumentIntakeRequest {
    const parsed = documentIntakeRequestSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid document intake command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
