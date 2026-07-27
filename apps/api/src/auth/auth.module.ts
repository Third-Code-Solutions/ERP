import { Module } from '@nestjs/common'
import { CapabilityGuard } from './capability.guard'
import { SupabaseJwtGuard } from './supabase-jwt.guard'
import { SupabaseIdentityService } from './supabase-identity.service'

@Module({
  providers: [
    SupabaseIdentityService,
    SupabaseJwtGuard,
    CapabilityGuard,
  ],
  exports: [
    SupabaseIdentityService,
    SupabaseJwtGuard,
    CapabilityGuard,
  ],
})
export class AuthModule {}
