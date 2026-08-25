import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  documentUploadReservationRequestSchema,
  documentUploadReservationMutationBodySchema,
  type DocumentUploadReservationMutationBody,
  type DocumentUploadReservationRequest,
} from '@third-code-erp/shared-types'

@Injectable()
export class DocumentUploadReservationPipe
  implements PipeTransform<unknown, DocumentUploadReservationRequest>
{
  transform(value: unknown): DocumentUploadReservationRequest {
    const parsed = documentUploadReservationRequestSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid document upload reservation command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}

@Injectable()
export class DocumentUploadReservationMutationPipe
  implements PipeTransform<unknown, DocumentUploadReservationMutationBody>
{
  transform(value: unknown): DocumentUploadReservationMutationBody {
    const parsed = documentUploadReservationMutationBodySchema.safeParse(
      value === undefined ? {} : value
    )
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid document upload reservation mutation body',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
