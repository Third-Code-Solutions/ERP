import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  cortexSemanticIndexCommandSchema,
  type CortexSemanticIndexCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexSemanticIndexPipe
  implements PipeTransform<unknown, CortexSemanticIndexCommand>
{
  transform(value: unknown): CortexSemanticIndexCommand {
    const parsed = cortexSemanticIndexCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex semantic index request',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
