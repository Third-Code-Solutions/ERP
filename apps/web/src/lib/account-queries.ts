import { db } from '@third-code-erp/database'
import { accounts, opportunities } from '@third-code-erp/database/schema'
import {
  accountReadsUseCoreApi,
  getAccountsThroughCoreApi,
} from './erp-core-client'
import {
  asc,
  desc,
  and,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type {
  AccountIndustry,
  KycStatus,
} from '@third-code-erp/shared-types'

export const ACCOUNT_SORT_VALUES = [
  'created_at',
  'name',
  'kyc_status',
] as const
export type AccountSort = (typeof ACCOUNT_SORT_VALUES)[number]
export type AccountOrder = 'asc' | 'desc'

export interface AccountFilters {
  q?: string
  industry?: AccountIndustry
  kycStatus?: KycStatus
  sort?: AccountSort
  order?: AccountOrder
  page?: number
  limit?: number
}

export interface AccountListRow {
  id: string
  name: string
  industry: AccountIndustry
  kyc_status: KycStatus
  primary_email: string | null
  primary_phone: string | null
  created_at: Date
  updated_at: Date
  opp_count: number
}

export interface FilteredAccountsResult {
  rows: AccountListRow[]
  total: number
  page: number
  limit: number
  totalPages: number
}

function coreRowToAccount(row: {
  id: string
  name: string
  industry: AccountIndustry
  kycStatus: KycStatus
  primaryEmail: string | null
  primaryPhone: string | null
  createdAt: string
  updatedAt: string
  opportunityCount: number
}): AccountListRow {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    kyc_status: row.kycStatus,
    primary_email: row.primaryEmail,
    primary_phone: row.primaryPhone,
    created_at: new Date(row.createdAt),
    updated_at: new Date(row.updatedAt),
    opp_count: row.opportunityCount,
  }
}

export async function getAccountsFiltered(
  tenantId: string,
  filters: AccountFilters = {}
): Promise<FilteredAccountsResult> {
  const sort = filters.sort ?? 'created_at'
  const order = filters.order ?? 'desc'
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20))

  if (accountReadsUseCoreApi(tenantId)) {
    const result = await getAccountsThroughCoreApi({
      q: filters.q,
      industry: filters.industry,
      kycStatus: filters.kycStatus,
      sort,
      order,
      page,
      limit,
    })
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'Account list was not read')
    }
    if (
      result.data.page !== page ||
      result.data.limit !== limit ||
      result.data.rows.some((row) => row.tenantId !== tenantId)
    ) {
      throw new Error('Account list returned an invalid tenant scope')
    }
    return {
      rows: result.data.rows.map(coreRowToAccount),
      total: result.data.total,
      page: result.data.page,
      limit: result.data.limit,
      totalPages: result.data.totalPages,
    }
  }

  const conditions: SQL[] = [eq(accounts.tenant_id, tenantId)]
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`
    const search = or(
      ilike(accounts.name, term),
      ilike(accounts.primary_email, term),
      ilike(accounts.primary_phone, term)
    )
    if (search) conditions.push(search)
  }
  if (filters.industry) conditions.push(eq(accounts.industry, filters.industry))
  if (filters.kycStatus) {
    conditions.push(eq(accounts.kyc_status, filters.kycStatus))
  }
  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)
  const sortColumn =
    sort === 'name'
      ? accounts.name
      : sort === 'kyc_status'
        ? accounts.kyc_status
        : accounts.created_at
  const primaryOrder = order === 'asc' ? asc(sortColumn) : desc(sortColumn)
  const tieOrder = order === 'asc' ? asc(accounts.id) : desc(accounts.id)
  const offset = (page - 1) * limit

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        industry: accounts.industry,
        kyc_status: accounts.kyc_status,
        primary_email: accounts.primary_email,
        primary_phone: accounts.primary_phone,
        created_at: accounts.created_at,
        updated_at: accounts.updated_at,
        opp_count: sql<number>`count(${opportunities.id})::int`,
      })
      .from(accounts)
      .leftJoin(opportunities, eq(opportunities.account_id, accounts.id))
      .where(whereClause)
      .groupBy(accounts.id)
      .orderBy(primaryOrder, tieOrder)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(accounts)
      .where(whereClause),
  ])

  const total = Number(countRows[0]?.count ?? 0)
  return {
    rows,
    total,
    page,
    limit,
    totalPages: total === 0 ? 1 : Math.ceil(total / limit),
  }
}
