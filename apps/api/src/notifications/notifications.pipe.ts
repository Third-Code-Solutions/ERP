import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import {
  notificationReadStateCommandSchema,
  type NotificationReadStateCommand,
} from '@third-code-erp/shared-types'

@Injectable()
export class NotificationReadStatePipe
  implements PipeTransform<unknown, NotificationReadStateCommand>
{
  transform(value: unknown): NotificationReadStateCommand {
    const parsed = notificationReadStateCommandSchema.safeParse(value)
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid notification read-state command',
        errors: parsed.error.flatten(),
      })
    }
    return parsed.data
  }
}
