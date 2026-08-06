import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  assetMaintenanceListQuerySchema,
  type AssetMaintenanceListQuery,
} from '@third-code-erp/shared-types'

@Injectable()
export class AssetMaintenanceListPipe
  implements PipeTransform<unknown, AssetMaintenanceListQuery>
{
  transform(value: unknown): AssetMaintenanceListQuery {
    const parsed = assetMaintenanceListQuerySchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid asset maintenance query',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
