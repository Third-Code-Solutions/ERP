import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common'
import type {
  ProjectRetirementResult,
  RetireProjectCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { ProjectRetirementService } from './project-retirement.service'
import { RetireProjectPipe } from './retire-project.pipe'

@Controller('v1/projects')
export class ProjectRetirementController {
  constructor(
    @Inject(ProjectRetirementService)
    private readonly retirements: ProjectRetirementService,
  ) {}

  @Delete(':projectId')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.delete')
  retire(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(RetireProjectPipe) command: RetireProjectCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectRetirementResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.trim().length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.retirements.retire(
      projectId,
      command,
      principal,
      idempotencyKey.trim(),
    )
  }
}
