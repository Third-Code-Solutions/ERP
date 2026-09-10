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
  Post,
  Query,
} from '@nestjs/common'
import {
  createProjectWeeklyProgressCommandSchema,
  lockProjectWeeklyProgressCommandSchema,
  projectWeeklyProgressListQuerySchema,
  type ProjectWeeklyProgressListResult,
  type ProjectWeeklyProgressLockResult,
  type ProjectWeeklyProgressMutationResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { ProjectWeeklyProgressService } from './project-weekly-progress.service'

@Controller('v1/projects')
export class ProjectWeeklyProgressController {
  constructor(
    @Inject(ProjectWeeklyProgressService)
    private readonly progress: ProjectWeeklyProgressService,
  ) {}

  @Get(':projectId/progress/weekly')
  @RequireCapabilities('project.read')
  list(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectWeeklyProgressListResult> {
    const parsed = projectWeeklyProgressListQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid weekly progress filters')
    return this.progress.list(projectId, parsed.data, principal)
  }

  @Post(':projectId/progress/weekly')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('project.weekly_progress.submit')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectWeeklyProgressMutationResult> {
    const parsed = createProjectWeeklyProgressCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid weekly progress capture')
    if (parsed.data.projectId !== projectId) throw new BadRequestException('Project id does not match route')
    return this.progress.create(parsed.data, principal)
  }

  @Post(':projectId/progress/weekly/:periodId/lock')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('precon.manage_checklist')
  lock(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectWeeklyProgressLockResult> {
    const parsed = lockProjectWeeklyProgressCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid weekly progress lock')
    return this.progress.lock(projectId, periodId, parsed.data, principal)
  }
}
