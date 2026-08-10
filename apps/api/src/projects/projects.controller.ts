import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import type {
  CreateProjectCommand,
  ProjectCreationResult,
  ProjectListQuery,
  ProjectListResult,
  ProjectReadResult,
  ProjectCommandCenterQuery,
  ProjectCommandCenterResult,
  ProjectUpdateResult,
  UpdateProjectCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CreateProjectPipe } from './create-project.pipe'
import { ProjectsService } from './projects.service'
import { ProjectCommandCenterPipe } from './project-command-center.pipe'
import { ProjectCommandCenterService } from './project-command-center.service'
import { ProjectListPipe } from './project-list.pipe'
import { UpdateProjectPipe } from './update-project.pipe'

@Controller('v1/projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService)
    private readonly projects: ProjectsService,
    @Inject(ProjectCommandCenterService)
    private readonly commandCenter: ProjectCommandCenterService
  ) {}

  @Get()
  @RequireCapabilities('project.read')
  list(
    @Query(new ProjectListPipe()) query: ProjectListQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProjectListResult> {
    return this.projects.list(query, principal)
  }

  @Get(':projectId')
  @RequireCapabilities('project.read')
  read(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProjectReadResult> {
    return this.projects.read(projectId, principal)
  }

  @Get(':projectId/command-center')
  @RequireCapabilities('project.read')
  commandCenterRead(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query(new ProjectCommandCenterPipe()) query: ProjectCommandCenterQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProjectCommandCenterResult> {
    return this.commandCenter.read(projectId, query, principal)
  }

  @Post()
  @RequireCapabilities('project.create')
  create(
    @Body(CreateProjectPipe) command: CreateProjectCommand,
    @CurrentPrincipal() principal: ErpPrincipal,
    @Headers('Idempotency-Key') idempotencyKey: string | undefined
  ): Promise<ProjectCreationResult> {
    return this.projects.create(command, principal, idempotencyKey)
  }

  @Patch(':projectId')
  @RequireCapabilities('project.update')
  update(
    @Param('projectId', new ParseUUIDPipe())
    projectId: string,
    @Body(UpdateProjectPipe) command: UpdateProjectCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProjectUpdateResult> {
    return this.projects.update(projectId, command, principal)
  }
}
