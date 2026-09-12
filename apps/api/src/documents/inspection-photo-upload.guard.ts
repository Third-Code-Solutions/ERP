import { BadRequestException, ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { z } from 'zod'
import { requireCurrentPrincipal, type AuthenticatedRequest } from '../auth/current-principal.decorator'
import { InspectionPhotoService } from './inspection-photo.service'

@Injectable()
export class InspectionPhotoUploadGuard implements CanActivate {
  constructor(@Inject(InspectionPhotoService) private readonly photos: InspectionPhotoService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const principal = requireCurrentPrincipal(request)
    const opportunity = z.string().uuid().safeParse(request.params.opportunityId)
    if (!opportunity.success) throw new BadRequestException('Invalid opportunity id')
    const actor = z.string().uuid().safeParse(request.headers['x-expected-actor-id'])
    const tenant = z.string().uuid().safeParse(request.headers['x-expected-tenant-id'])
    if (!actor.success || !tenant.success || actor.data.toLowerCase() !== principal.userId.toLowerCase() || tenant.data.toLowerCase() !== principal.tenantId.toLowerCase()) {
      throw new ForbiddenException('The signed-in account changed; reload before uploading')
    }
    await this.photos.authorizeUpload(opportunity.data, principal)
    return true
  }
}
