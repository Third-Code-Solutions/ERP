import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common'
import {
  assetListQuerySchema,
  type AssetListQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class AssetListPipe
  implements PipeTransform<unknown, AssetListQuery>
{
  transform(value: unknown): AssetListQuery {
    const parsed = assetListQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid asset list query',
        errors: parsed.error.flatten(),
      })
    }

    return parsed.data
  }
}
