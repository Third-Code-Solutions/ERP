import { Inject, Injectable } from '@nestjs/common'
import {
  accounts,
  opportunities,
  type Account,
} from '@third-code-erp/database/schema'
import {
  accountListResultSchema,
  type AccountListQuery,
  type AccountListResult,
  type AccountReadResult,
} from '@third-code-erp/shared-types'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class AccountsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async list(
    query: AccountListQuery,
    principal: ErpPrincipal
  ): Promise<AccountListResult> {
    const conditions = [eq(accounts.tenant_id, principal.tenantId)]

    if (query.q) {
      const term = `%${query.q}%`
      const search = or(
        ilike(accounts.name, term),
        ilike(accounts.primary_email, term),
        ilike(accounts.primary_phone, term)
      )
      if (search) conditions.push(search)
    }
    if (query.industry) conditions.push(eq(accounts.industry, query.industry))
    if (query.kycStatus) {
      conditions.push(eq(accounts.kyc_status, query.kycStatus))
    }

    const whereClause =
      conditions.length === 1 ? conditions[0] : and(...conditions)
    const sortColumn =
      query.sort === 'name'
        ? accounts.name
        : query.sort === 'kyc_status'
          ? accounts.kyc_status
          : accounts.created_at
    const primaryOrder = query.order === 'asc' ? asc(sortColumn) : desc(sortColumn)
    const tieOrder = query.order === 'asc' ? asc(accounts.id) : desc(accounts.id)
    const offset = (query.page - 1) * query.limit

    const [rows, countRows] = await Promise.all([
      this.database.client
        .select({
          account: accounts,
          opportunityCount: sql<number>`count(${opportunities.id})::int`,
        })
        .from(accounts)
        .leftJoin(opportunities, eq(opportunities.account_id, accounts.id))
        .where(whereClause)
        .groupBy(accounts.id)
        .orderBy(primaryOrder, tieOrder)
        .limit(query.limit)
        .offset(offset),
      this.database.client
        .select({ count: sql<number>`count(*)::int` })
        .from(accounts)
        .where(whereClause),
    ])

    const total = Number(countRows[0]?.count ?? 0)
    const totalPages = total === 0 ? 1 : Math.ceil(total / query.limit)
    return accountListResultSchema.parse({
      rows: rows.map(({ account, opportunityCount }) =>
        this.readResult({ account, opportunityCount })
      ),
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    })
  }

  private readResult(row: {
    account: Account
    opportunityCount: number
  }): AccountReadResult {
    const { account, opportunityCount } = row
    return {
      id: account.id,
      tenantId: account.tenant_id,
      name: account.name,
      industry: account.industry,
      billingAddress: account.billing_address,
      primaryEmail: account.primary_email,
      primaryPhone: account.primary_phone,
      kycStatus: account.kyc_status,
      createdAt: account.created_at.toISOString(),
      updatedAt: account.updated_at.toISOString(),
      createdBy: account.created_by,
      opportunityCount: Number(opportunityCount),
    }
  }
}
