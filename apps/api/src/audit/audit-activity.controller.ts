import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  AuditActivityQuery,
  AuditActivityResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { AuditActivityPipe } from './audit-activity.pipe'
import { AuditActivityService } from './audit-activity.service'

@Controller('v1/audit/activity')
export class AuditActivityController {
  constructor(
    @Inject(AuditActivityService)
    private readonly activity: AuditActivityService
  ) {}

  @Get()
  @RequireCapabilities('audit.read')
  list(
    @Query(new AuditActivityPipe()) query: AuditActivityQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<AuditActivityResult> {
    return this.activity.list(query, principal)
  }
}
