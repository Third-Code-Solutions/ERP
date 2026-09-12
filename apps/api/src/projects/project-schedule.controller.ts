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
  createProjectScheduleTaskCommandSchema,
  importLegacyProjectScheduleCommandSchema,
  type ImportLegacyProjectScheduleResult,
  type LegacyProjectSchedulePreview,
  projectScheduleDependencyQuerySchema,
  type ProjectScheduleDependencyResult,
  projectScheduleListQuerySchema,
  projectScheduleTaskStatusCommandSchema,
  updateProjectScheduleTaskCommandSchema,
  type ProjectScheduleCreateResult,
  type ProjectScheduleListResult,
  type ProjectScheduleMutationResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { ProjectScheduleService } from './project-schedule.service'

@Controller('v1/projects')
export class ProjectScheduleController {
  constructor(@Inject(ProjectScheduleService) private readonly schedule: ProjectScheduleService) {}

  @Get(':projectId/schedule/legacy-l1/preview')
  @RequireCapabilities('project.schedule.manage')
  previewLegacy(@Param('projectId', new ParseUUIDPipe()) projectId: string, @CurrentPrincipal() principal: ErpPrincipal): Promise<LegacyProjectSchedulePreview> {
    return this.schedule.previewLegacy(projectId, principal)
  }

  @Post(':projectId/schedule/import-legacy-l1')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.schedule.manage')
  importLegacy(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ImportLegacyProjectScheduleResult> {
    const parsed = importLegacyProjectScheduleCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid legacy schedule import')
    return this.schedule.importLegacy(projectId, parsed.data, principal)
  }

  @Get(':projectId/schedule/tasks')
  @RequireCapabilities('project.read')
  list(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Query() query: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectScheduleListResult> {
    const parsed = projectScheduleListQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid schedule filters')
    return this.schedule.list(projectId, parsed.data, principal)
  }

  @Get(':projectId/schedule/dependency-options')
  @RequireCapabilities('project.read')
  dependencyOptions(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Query() query: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectScheduleDependencyResult> {
    const parsed = projectScheduleDependencyQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid schedule dependency filters')
    return this.schedule.dependencyOptions(projectId, parsed.data, principal)
  }

  @Post(':projectId/schedule/tasks')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('project.schedule.manage')
  create(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectScheduleCreateResult> {
    const parsed = createProjectScheduleTaskCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid schedule task')
    if (parsed.data.projectId !== projectId) throw new BadRequestException('Project id does not match route')
    return this.schedule.create(parsed.data, principal)
  }

  @Patch(':projectId/schedule/tasks/:taskId')
  @RequireCapabilities('project.schedule.manage')
  update(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectScheduleMutationResult> {
    const parsed = updateProjectScheduleTaskCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid schedule task update')
    return this.schedule.update(projectId, taskId, parsed.data, principal)
  }

  @Post(':projectId/schedule/tasks/:taskId/status')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.schedule.manage')
  updateStatus(@Param('projectId', new ParseUUIDPipe()) projectId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() body: unknown, @CurrentPrincipal() principal: ErpPrincipal): Promise<ProjectScheduleMutationResult> {
    const parsed = projectScheduleTaskStatusCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid schedule status update')
    return this.schedule.updateStatus(projectId, taskId, parsed.data, principal)
  }
}
