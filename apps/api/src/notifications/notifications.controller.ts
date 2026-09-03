import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common'
import type {
  NotificationListResult,
  NotificationReadStateCommand,
  NotificationReadStateResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { NotificationReadStatePipe } from './notifications.pipe'
import { NotificationsService } from './notifications.service'

@Controller('v1/notifications')
@RequireCapabilities('notification.read')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService
  ) {}

  @Get()
  list(@CurrentPrincipal() principal: ErpPrincipal): Promise<NotificationListResult> {
    return this.notifications.list(principal)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('notification.manage')
  markReadState(
    @Body(NotificationReadStatePipe) command: NotificationReadStateCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<NotificationReadStateResult> {
    return this.notifications.markReadState(command, principal)
  }
}
