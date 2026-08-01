import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  documentProcessingRequestSchema,
  type DocumentProcessingRequest,
} from '@third-code-erp/shared-types'

@Injectable()
export class DocumentProcessingPipe
  implements PipeTransform<unknown, DocumentProcessingRequest>
{
  transform(value: unknown): DocumentProcessingRequest {
    const parsed = documentProcessingRequestSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid document processing request',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
