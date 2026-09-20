import { BadRequestException, Controller, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Body } from '@nestjs/common'
import { createClaimDraftCommandSchema, type CreateClaimDraftResult } from '@third-code-erp/shared-types'
import { RequireAnyCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { ClaimDraftService } from './claim-draft.service'

@Controller('v1/projects')
export class ClaimDraftController {
  constructor(@Inject(ClaimDraftService) private readonly claims: ClaimDraftService) {}

  @Post(':projectId/claims/drafts')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyCapabilities('kyc.create_ar_code', 'precon.manage_checklist')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<CreateClaimDraftResult> {
    const parsed = createClaimDraftCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid claim draft command')
    if (parsed.data.projectId.toLowerCase() !== projectId.toLowerCase()) throw new BadRequestException('Project id does not match route')
    return this.claims.create(parsed.data, principal)
  }
}
