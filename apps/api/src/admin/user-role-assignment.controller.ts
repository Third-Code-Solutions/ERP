import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common'
import type {
  UserRoleAssignmentCommand,
  UserRoleAssignmentResult,
} from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { UserRoleAssignmentPipe } from './user-role-assignment.pipe'
import { UserRoleAssignmentService } from './user-role-assignment.service'

@Controller('v1/admin/users')
export class UserRoleAssignmentController {
  constructor(
    @Inject(UserRoleAssignmentService)
    private readonly assignments: UserRoleAssignmentService
  ) {}

  @Patch(':userId/role')
  @RequireCapabilities('admin.users')
  assign(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(UserRoleAssignmentPipe) command: UserRoleAssignmentCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<UserRoleAssignmentResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    return this.assignments.assign(
      userId,
      command,
      principal,
      idempotencyKey
    )
  }
}
