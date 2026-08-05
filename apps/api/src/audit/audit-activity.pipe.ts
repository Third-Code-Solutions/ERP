import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  auditActivityQuerySchema,
  type AuditActivityQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class AuditActivityPipe
  implements PipeTransform<unknown, AuditActivityQuery>
{
  transform(value: unknown): AuditActivityQuery {
    const parsed = auditActivityQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid audit activity query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
