import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { NotificationReadStatePipe } from './notifications.pipe'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'

@Module({
  imports: [AuditModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationReadStatePipe],
})
export class NotificationsModule {}
