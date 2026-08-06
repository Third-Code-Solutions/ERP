import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  assetMaintenanceDueQuerySchema,
  type AssetMaintenanceDueQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class AssetMaintenanceDuePipe
  implements PipeTransform<unknown, AssetMaintenanceDueQuery>
{
  transform(value: unknown): AssetMaintenanceDueQuery {
    const parsed = assetMaintenanceDueQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid asset maintenance due query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
