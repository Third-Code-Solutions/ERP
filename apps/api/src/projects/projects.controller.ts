import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common'
import type {
  ProjectUpdateResult,
  UpdateProjectCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { ProjectsService } from './projects.service'
import { UpdateProjectPipe } from './update-project.pipe'

@Controller('v1/projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService)
    private readonly projects: ProjectsService
  ) {}

  @Patch(':projectId')
  @RequireCapabilities('project.update')
  update(
    @Param('projectId', new ParseUUIDPipe({ version: '4' }))
    projectId: string,
    @Body(UpdateProjectPipe) command: UpdateProjectCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProjectUpdateResult> {
    return this.projects.update(projectId, command, principal)
  }
}
