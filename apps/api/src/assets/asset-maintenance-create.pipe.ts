import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  createAssetMaintenanceRecordCommandSchema,
  type CreateAssetMaintenanceRecordCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class AssetMaintenanceCreatePipe
  implements PipeTransform<unknown, CreateAssetMaintenanceRecordCommand>
{
  transform(value: unknown): CreateAssetMaintenanceRecordCommand {
    const parsed = createAssetMaintenanceRecordCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid asset maintenance command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
