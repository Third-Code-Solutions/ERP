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
  createProjectRfiCommandSchema,
  projectRfiAnswerCommandSchema,
  projectRfiCloseCommandSchema,
  projectRfiListQuerySchema,
  type ProjectRfiCreateResult,
  type ProjectRfiListResult,
  type ProjectRfiTransitionResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { ProjectRfisService } from './project-rfis.service'

@Controller('v1/projects')
export class ProjectRfisController {
  constructor(
    @Inject(ProjectRfisService) private readonly rfis: ProjectRfisService,
  ) {}

  @Get(':projectId/rfis')
  @RequireCapabilities('project.rfi.read')
  list(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectRfiListResult> {
    const parsed = projectRfiListQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid project RFI filters')
    return this.rfis.list(projectId, parsed.data, principal)
  }

  @Post(':projectId/rfis')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('project.rfi.manage')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectRfiCreateResult> {
    const parsed = createProjectRfiCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid project RFI command')
    if (parsed.data.projectId !== projectId) {
      throw new BadRequestException('Project id does not match route')
    }
    return this.rfis.create(parsed.data, principal)
  }

  @Post(':projectId/rfis/:rfiId/answer')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.rfi.manage')
  answer(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('rfiId', new ParseUUIDPipe()) rfiId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectRfiTransitionResult> {
    return this.transition(projectId, rfiId, 'answer', body, principal)
  }

  @Post(':projectId/rfis/:rfiId/close')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.rfi.manage')
  close(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('rfiId', new ParseUUIDPipe()) rfiId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectRfiTransitionResult> {
    return this.transition(projectId, rfiId, 'close', body, principal)
  }

  @Post(':projectId/rfis/:rfiId/reopen')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.rfi.manage')
  reopen(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('rfiId', new ParseUUIDPipe()) rfiId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectRfiTransitionResult> {
    return this.transition(projectId, rfiId, 'reopen', body, principal)
  }

  private transition(
    projectId: string,
    rfiId: string,
    target: 'answer' | 'close' | 'reopen',
    body: unknown,
    principal: ErpPrincipal,
  ): Promise<ProjectRfiTransitionResult> {
    if (target === 'answer') {
      const parsed = projectRfiAnswerCommandSchema.safeParse(body)
      if (!parsed.success) throw new BadRequestException('Invalid project RFI answer')
      return this.rfis.answer(projectId, rfiId, parsed.data, principal)
    }
    const parsed = projectRfiCloseCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(`Invalid project RFI ${target} command`)
    return target === 'close'
      ? this.rfis.close(projectId, rfiId, parsed.data, principal)
      : this.rfis.reopen(projectId, rfiId, parsed.data, principal)
  }
}
