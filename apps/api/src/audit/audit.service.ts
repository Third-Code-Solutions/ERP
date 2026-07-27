import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseTransaction } from '../database/database.service'

@Injectable()
export class AuditService {
  async stampActor(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal
  ): Promise<void> {
    await transaction.execute(sql`
      select pg_catalog.set_config(
        'request.jwt.claims',
        pg_catalog.json_build_object(
          'sub',
          ${principal.userId}::uuid,
          'role',
          'authenticated'
        )::text,
        true
      )
    `)
  }
}
