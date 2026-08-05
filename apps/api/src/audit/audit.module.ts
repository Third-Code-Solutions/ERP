import { Module } from '@nestjs/common'
import { AuditActivityController } from './audit-activity.controller'
import { AuditActivityPipe } from './audit-activity.pipe'
import { AuditActivityService } from './audit-activity.service'
import { AuditService } from './audit.service'

@Module({
  controllers: [AuditActivityController],
  providers: [AuditService, AuditActivityService, AuditActivityPipe],
  exports: [AuditService, AuditActivityService],
})
export class AuditModule {}
