import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cadEvidenceCommitCommandSchema,
  type CadEvidenceCommitCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CadEvidenceCommitPipe
  implements PipeTransform<unknown, CadEvidenceCommitCommand>
{
  transform(value: unknown): CadEvidenceCommitCommand {
    const parsed = cadEvidenceCommitCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid CAD evidence commit command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
