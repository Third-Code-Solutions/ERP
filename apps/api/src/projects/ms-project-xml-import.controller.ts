import { BadRequestException, Body, Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { msProjectXmlCommitCommandSchema, msProjectXmlPreviewCommandSchema } from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { MsProjectXmlImportService } from './ms-project-xml-import.service'

@Controller('v1/projects')
export class MsProjectXmlImportController {
  constructor(@Inject(MsProjectXmlImportService) private readonly importer: MsProjectXmlImportService) {}

  @Post(':projectId/schedule/ms-project-xml/preview')
  @HttpCode(200)
  @RequireCapabilities('project.schedule.manage')
  preview(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): ReturnType<MsProjectXmlImportService['preview']> {
    const parsed = msProjectXmlPreviewCommandSchema.safeParse(body)
    if (!parsed.success || parsed.data.projectId.toLowerCase() !== projectId.toLowerCase()) throw new BadRequestException('Invalid XML preview request')
    return this.importer.preview(projectId, parsed.data, principal)
  }

  @Post(':projectId/schedule/ms-project-xml/import')
  @HttpCode(200)
  @RequireCapabilities('project.schedule.manage')
  import(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): ReturnType<MsProjectXmlImportService['import']> {
    const parsed = msProjectXmlCommitCommandSchema.safeParse(body)
    if (!parsed.success || parsed.data.projectId.toLowerCase() !== projectId.toLowerCase()) throw new BadRequestException('Invalid reviewed XML import request')
    return this.importer.import(projectId, parsed.data, principal)
  }
}
