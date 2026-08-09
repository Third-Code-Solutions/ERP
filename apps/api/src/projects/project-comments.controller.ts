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
  Post,
} from '@nestjs/common'
import type {
  CreateProjectCommentCommand,
  ProjectCommentCreationResult,
  ProjectCommentDeletionResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CreateProjectCommentPipe } from './project-comment.pipe'
import { ProjectCommentCreationService } from './project-comment-creation.service'
import { ProjectCommentDeletionService } from './project-comment-deletion.service'

@Controller('v1/projects')
export class ProjectCommentsController {
  constructor(
    @Inject(ProjectCommentCreationService)
    private readonly comments: ProjectCommentCreationService,
    @Inject(ProjectCommentDeletionService)
    private readonly deletions: ProjectCommentDeletionService
  ) {}

  @Post(':projectId/comments')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('project.update')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(CreateProjectCommentPipe) command: CreateProjectCommentCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProjectCommentCreationResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.trim().length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    if (command.projectId !== projectId) {
      throw new BadRequestException('Project id does not match route')
    }
    return this.comments.create(command, principal, idempotencyKey.trim())
  }

  @Delete(':projectId/comments/:commentId')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.update')
  delete(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProjectCommentDeletionResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.trim().length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.deletions.delete(
      { projectId, commentId },
      principal,
      idempotencyKey.trim()
    )
  }
}
