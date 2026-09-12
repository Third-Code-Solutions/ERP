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
  projectBillingMilestoneListQuerySchema,
  type ProjectBillingMilestoneListResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { ProjectBillingMilestonesService } from './project-billing-milestones.service'

@Controller('v1/projects')
export class ProjectBillingMilestonesController {
  constructor(
    @Inject(ProjectBillingMilestonesService)
    private readonly milestones: ProjectBillingMilestonesService,
  ) {}

  @Get(':projectId/billing/milestones')
  @RequireCapabilities('finance.read')
  list(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectBillingMilestoneListResult> {
    const parsed = projectBillingMilestoneListQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid billing milestone filters')
    return this.milestones.list(projectId, parsed.data, principal)
  }
}
