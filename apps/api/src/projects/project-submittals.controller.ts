import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import {
  createProjectSubmittalCommandSchema,
  projectSubmittalDecisionCommandSchema,
  projectSubmittalListQuerySchema,
  projectSubmittalReviewStartCommandSchema,
  projectSubmittalSubmitCommandSchema,
  updateProjectSubmittalCommandSchema,
  type ProjectSubmittalCreateResult,
  type ProjectSubmittalListResult,
  type ProjectSubmittalMutationResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { ProjectSubmittalsService } from './project-submittals.service'

@Controller('v1/projects')
export class ProjectSubmittalsController {
  constructor(@Inject(ProjectSubmittalsService) private readonly submittals: ProjectSubmittalsService) {}

  @Get(':projectId/submittals')
  @RequireCapabilities('project.submittal.read')
  list(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Query() query: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectSubmittalListResult> {
    const parsed = projectSubmittalListQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid submittal filters')
    return this.submittals.list(projectId, parsed.data, principal)
  }

  @Post(':projectId/submittals')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('project.submittal.manage')
  create(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectSubmittalCreateResult> {
    const parsed = createProjectSubmittalCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid submittal command')
    if (parsed.data.projectId !== projectId) throw new BadRequestException('Project id does not match route')
    return this.submittals.create(parsed.data, principal)
  }

  @Patch(':projectId/submittals/:submittalId')
  @RequireCapabilities('project.submittal.manage')
  update(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('submittalId', new ParseUUIDPipe()) submittalId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectSubmittalMutationResult> {
    const parsed = updateProjectSubmittalCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid submittal update')
    return this.submittals.update(projectId, submittalId, parsed.data, principal)
  }

  @Post(':projectId/submittals/:submittalId/submit')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.submittal.manage')
  submit(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('submittalId', new ParseUUIDPipe()) submittalId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectSubmittalMutationResult> {
    const parsed = projectSubmittalSubmitCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid submittal submit command')
    return this.submittals.submit(projectId, submittalId, parsed.data, principal)
  }

  @Post(':projectId/submittals/:submittalId/start-review')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.submittal.review')
  startReview(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('submittalId', new ParseUUIDPipe()) submittalId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectSubmittalMutationResult> {
    const parsed = projectSubmittalReviewStartCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid submittal review command')
    return this.submittals.startReview(projectId, submittalId, parsed.data, principal)
  }

  @Post(':projectId/submittals/:submittalId/review')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.submittal.review')
  decide(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('submittalId', new ParseUUIDPipe()) submittalId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectSubmittalMutationResult> {
    const parsed = projectSubmittalDecisionCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid submittal decision')
    return this.submittals.decide(projectId, submittalId, parsed.data, principal)
  }
}
