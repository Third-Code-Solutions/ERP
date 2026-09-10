import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common'
import {
  projectMaterialActualsQuerySchema,
  type ProjectMaterialActualsResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { ProjectMaterialActualsService } from './project-material-actuals.service'

@Controller('v1/projects')
export class ProjectMaterialActualsController {
  constructor(
    @Inject(ProjectMaterialActualsService)
    private readonly materialActuals: ProjectMaterialActualsService,
  ) {}

  @Get(':projectId/material-actuals')
  @RequireCapabilities('project.material_actuals.read')
  read(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ProjectMaterialActualsResult> {
    const parsed = projectMaterialActualsQuerySchema.safeParse(query)
    if (!parsed.success) {
      throw new BadRequestException('Invalid project material actuals query')
    }
    return this.materialActuals.read(projectId, parsed.data, principal)
  }
}
