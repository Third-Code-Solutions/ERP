import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  cortexAssistantGenerationStartCommandSchema,
  type CortexAssistantGenerationStartCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexAssistantGenerationStartPipe
  implements PipeTransform<unknown, CortexAssistantGenerationStartCommand>
{
  transform(value: unknown): CortexAssistantGenerationStartCommand {
    const parsed = cortexAssistantGenerationStartCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid Cortex assistant generation job',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
