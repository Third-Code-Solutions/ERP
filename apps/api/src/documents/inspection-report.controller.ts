import { BadRequestException, Body, Controller, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import type { InspectionReportArchiveResult } from '@third-code-erp/shared-types'
import { z } from 'zod'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InspectionReportService } from './inspection-report.service'

@Controller('v1/opportunities')
export class InspectionReportController {
  constructor(@Inject(InspectionReportService) private readonly reports: InspectionReportService) {}

  @Post(':opportunityId/inspections/:inspectionId/report')
  @RequireCapabilities('site_inspection.submit')
  archive(
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Param('inspectionId', new ParseUUIDPipe()) inspectionId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<InspectionReportArchiveResult> {
    if (!z.object({}).strict().safeParse(body).success) throw new BadRequestException('Inspection report body must be an empty object')
    return this.reports.archive({ opportunityId, inspectionId }, principal)
  }
}
