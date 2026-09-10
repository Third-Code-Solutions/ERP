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
  projectLabourReconciliationQuerySchema,
  type ProjectLabourReconciliationResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { ProjectLabourReconciliationService } from './project-labour-reconciliation.service'

@Controller('v1/projects')
export class ProjectLabourReconciliationController {
  constructor(
    @Inject(ProjectLabourReconciliationService)
    private readonly labour: ProjectLabourReconciliationService,
  ) {}

  @Get(':projectId/labour-reconciliation')
  @RequireCapabilities('project.read')
  read(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectLabourReconciliationResult> {
    const parsed = projectLabourReconciliationQuerySchema.safeParse(query)
    if (!parsed.success) {
      throw new BadRequestException('Invalid project labour reconciliation query')
    }
    return this.labour.read(projectId, parsed.data, principal)
  }
}
