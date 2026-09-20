import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { claimDocumentAttachCommandSchema, type ClaimDocumentAttachCommand } from '@third-code-erp/shared-types'

@Injectable()
export class ClaimDocumentPipe implements PipeTransform<unknown, ClaimDocumentAttachCommand> {
  transform(value: unknown): ClaimDocumentAttachCommand {
    const parsed = claimDocumentAttachCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid claim attachment command', errors: parsed.error.flatten() })
    }
    return parsed.data
  }
}
