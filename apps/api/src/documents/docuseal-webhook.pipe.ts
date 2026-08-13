import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  docuSealWebhookCommandSchema,
  type DocuSealWebhookCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class DocuSealWebhookPipe
  implements PipeTransform<unknown, DocuSealWebhookCommand>
{
  transform(value: unknown): DocuSealWebhookCommand {
    const parsed = docuSealWebhookCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid DocuSeal webhook payload',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
