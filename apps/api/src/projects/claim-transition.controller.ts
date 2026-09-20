import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { claimTransitionCommandSchema, type ClaimTransitionResult } from '@third-code-erp/shared-types'
import { RequireAnyCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { ClaimTransitionService } from './claim-transition.service'

@Controller('v1/claims')
export class ClaimTransitionController {
  constructor(@Inject(ClaimTransitionService) private readonly claims: ClaimTransitionService) {}

  @Post(':claimId/transition')
  @HttpCode(HttpStatus.OK)
  @RequireAnyCapabilities('po.create', 'precon.manage_checklist', 'finance.issue_invoice')
  transition(
    @Param('claimId', new ParseUUIDPipe()) claimId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ClaimTransitionResult> {
    const parsed = claimTransitionCommandSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid claim transition command')
    return this.claims.transition(claimId, parsed.data, principal)
  }
}
