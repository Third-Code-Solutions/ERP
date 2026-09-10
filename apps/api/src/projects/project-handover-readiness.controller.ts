import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common'
import {
  projectHandoverReadinessQuerySchema,
  type ProjectHandoverReadinessResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { ProjectHandoverReadinessService } from './project-handover-readiness.service'

@Controller('v1/projects')
export class ProjectHandoverReadinessController {
  constructor(
    @Inject(ProjectHandoverReadinessService)
    private readonly readiness: ProjectHandoverReadinessService,
  ) {}

  @Get(':projectId/handover-readiness')
  @RequireCapabilities('project.read')
  read(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectHandoverReadinessResult> {
    const parsed = projectHandoverReadinessQuerySchema.safeParse(query)
    if (!parsed.success) {
      throw new BadRequestException('Invalid project handover readiness query')
    }
    return this.readiness.read(projectId, parsed.data, principal)
  }
}
