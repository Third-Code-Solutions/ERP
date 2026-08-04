import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common'
import type {
  CreateProjectCommand,
  ProjectCreationResult,
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
import { UpdateProjectPipe } from './update-project.pipe'

@Controller('v1/projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService)
    private readonly projects: ProjectsService
  ) {}

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
