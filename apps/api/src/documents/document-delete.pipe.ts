import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  documentDeleteBodySchema,
  type DocumentDeleteBody,
} from '@third-code-erp/shared-types'

@Injectable()
export class DocumentDeletePipe
  implements PipeTransform<unknown, DocumentDeleteBody>
{
  transform(value: unknown): DocumentDeleteBody {
    const parsed = documentDeleteBodySchema.safeParse(value ?? {})
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid document deletion command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
