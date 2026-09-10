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
  projectPerformanceQuerySchema,
  type ProjectPerformanceResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { ProjectPerformanceService } from './project-performance.service'

@Controller('v1/projects')
export class ProjectPerformanceController {
  constructor(
    @Inject(ProjectPerformanceService)
    private readonly performance: ProjectPerformanceService,
  ) {}

  @Get(':projectId/performance')
  @RequireCapabilities('project.read')
  read(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectPerformanceResult> {
    const parsed = projectPerformanceQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid performance query')
    return this.performance.read(projectId, parsed.data, principal)
  }
}
