import { Injectable } from '@nestjs/common'
import { db, type Database } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'

export type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0]

@Injectable()
export class DatabaseService {
  readonly client: Database = db

  async ping(): Promise<void> {
    await this.client.execute(sql`select 1 as ready`)
  }
}
