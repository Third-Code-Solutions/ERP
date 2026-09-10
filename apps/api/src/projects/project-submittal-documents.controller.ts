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
  projectDocumentListQuerySchema,
  projectSubmittalDocumentLinkCommandSchema,
  projectSubmittalDocumentUnlinkCommandSchema,
  type ProjectDocumentListResult,
  type ProjectSubmittalDocumentLinkResult,
  type ProjectSubmittalDocumentListResult,
  type ProjectSubmittalDocumentUnlinkResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { ProjectSubmittalDocumentsService } from './project-submittal-documents.service'

@Controller('v1/projects')
export class ProjectSubmittalDocumentsController {
  constructor(
    @Inject(ProjectSubmittalDocumentsService)
    private readonly documents: ProjectSubmittalDocumentsService,
  ) {}

  @Get(':projectId/documents')
  @RequireCapabilities('project.submittal.read')
  listProjectDocuments(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectDocumentListResult> {
    const parsed = projectDocumentListQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid project document filters')
    return this.documents.listProjectDocuments(projectId, parsed.data, principal)
  }

  @Get(':projectId/submittals/:submittalId/documents')
  @RequireCapabilities('project.submittal.read')
  list(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('submittalId', new ParseUUIDPipe()) submittalId: string,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectSubmittalDocumentListResult> {
    return this.documents.list(projectId, submittalId, principal)
  }

  @Post(':projectId/submittals/:submittalId/documents')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('project.submittal.manage')
  link(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('submittalId', new ParseUUIDPipe()) submittalId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectSubmittalDocumentLinkResult> {
    const parsed = projectSubmittalDocumentLinkCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid submittal document link')
    return this.documents.link(projectId, submittalId, parsed.data, principal)
  }

  @Post(':projectId/submittals/:submittalId/documents/:linkId/unlink')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.submittal.manage')
  unlink(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('submittalId', new ParseUUIDPipe()) submittalId: string,
    @Param('linkId', new ParseUUIDPipe()) linkId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectSubmittalDocumentUnlinkResult> {
    const parsed = projectSubmittalDocumentUnlinkCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid submittal document unlink')
    return this.documents.unlink(projectId, submittalId, linkId, parsed.data, principal)
  }
}
