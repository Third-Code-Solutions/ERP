import { Module } from '@nestjs/common'
import { CapabilityGuard } from './capability.guard'
import { SupabaseJwtGuard } from './supabase-jwt.guard'
import { SupabaseIdentityService } from './supabase-identity.service'
import { PlatformOwnerGuard } from './platform-owner.guard'

@Module({
  providers: [
    SupabaseIdentityService,
    SupabaseJwtGuard,
    CapabilityGuard,
    PlatformOwnerGuard,
  ],
  exports: [
    SupabaseIdentityService,
    SupabaseJwtGuard,
    CapabilityGuard,
    PlatformOwnerGuard,
  ],
})
export class AuthModule {}
