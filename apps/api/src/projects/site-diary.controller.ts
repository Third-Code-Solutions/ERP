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
  createSiteDiaryCommandSchema,
  siteDiaryListQuerySchema,
  submitSiteDiaryCommandSchema,
  updateSiteDiaryCommandSchema,
  type SiteDiaryCreateResult,
  type SiteDiaryListResult,
  type SiteDiaryMutationResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { SiteDiaryService } from './site-diary.service'

@Controller('v1/projects')
export class SiteDiaryController {
  constructor(
    @Inject(SiteDiaryService) private readonly diary: SiteDiaryService,
  ) {}

  @Get(':projectId/diary')
  @RequireCapabilities('project.diary.read')
  list(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<SiteDiaryListResult> {
    const parsed = siteDiaryListQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('Invalid site diary filters')
    return this.diary.list(projectId, parsed.data, principal)
  }

  @Post(':projectId/diary')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('project.diary.manage')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<SiteDiaryCreateResult> {
    const parsed = createSiteDiaryCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid site diary command')
    if (parsed.data.projectId !== projectId) {
      throw new BadRequestException('Project id does not match route')
    }
    return this.diary.create(parsed.data, principal)
  }

  @Patch(':projectId/diary/:entryId')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.diary.manage')
  update(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<SiteDiaryMutationResult> {
    const parsed = updateSiteDiaryCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid site diary update')
    return this.diary.update(projectId, entryId, parsed.data, principal)
  }

  @Post(':projectId/diary/:entryId/submit')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('project.diary.manage')
  submit(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<SiteDiaryMutationResult> {
    const parsed = submitSiteDiaryCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid site diary submit command')
    return this.diary.submit(projectId, entryId, parsed.data, principal)
  }
}
