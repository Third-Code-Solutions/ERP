import { BadRequestException, Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common'
import { projectCloseoutReadinessQuerySchema, type ProjectCloseoutReadinessResult } from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { ProjectCloseoutReadinessService } from './project-closeout-readiness.service'

@Controller('v1/projects')
export class ProjectCloseoutReadinessController {
  constructor(@Inject(ProjectCloseoutReadinessService) private readonly readiness: ProjectCloseoutReadinessService) {}

  @Get(':projectId/closeout-readiness')
  @RequireCapabilities('project.read')
  read(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectCloseoutReadinessResult> {
    const parsed = projectCloseoutReadinessQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid project closeout readiness query')
    return this.readiness.read(projectId, parsed.data, principal)
  }
}
