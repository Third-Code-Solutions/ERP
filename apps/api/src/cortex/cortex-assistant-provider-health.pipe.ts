import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  cortexAssistantProviderHealthQuerySchema,
  type CortexAssistantProviderHealthQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class CortexAssistantProviderHealthPipe
  implements PipeTransform<unknown, CortexAssistantProviderHealthQuery>
{
  transform(value: unknown): CortexAssistantProviderHealthQuery {
    const parsed = cortexAssistantProviderHealthQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException('Invalid provider health query')
    }
    return parsed.data
  }
}
