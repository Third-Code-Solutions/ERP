import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  accountListQuerySchema,
  type AccountListQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class AccountListPipe
  implements PipeTransform<unknown, AccountListQuery>
{
  transform(value: unknown): AccountListQuery {
    const parsed = accountListQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid account list query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
