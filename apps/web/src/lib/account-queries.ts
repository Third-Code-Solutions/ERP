import { db } from '@third-code-erp/database'
import {
  accountKycArtifacts,
  accounts,
  contacts,
  documents,
  opportunities,
  projects,
} from '@third-code-erp/database/schema'
import {
  accountReadsUseCoreApi,
  getAccountThroughCoreApi,
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
import type {
  Account,
  Contact,
  Opportunity,
  Project,
} from '@third-code-erp/database/schema'

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

export interface AccountKycDetailRow {
  id: string
  artifact_type: string
  notes: string | null
  uploaded_at: Date
  document_id: string | null
  file_name: string | null
}

export interface AccountDetailData {
  account: Account
  contactRows: Contact[]
  kycRows: AccountKycDetailRow[]
  oppRows: Array<Pick<Opportunity, 'id' | 'stage' | 'tcv_cents'>>
  projectRows: Array<Pick<Project, 'id' | 'name' | 'status'>>
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

export async function getAccountDetail(
  tenantId: string,
  accountId: string
): Promise<AccountDetailData | null> {
  if (accountReadsUseCoreApi(tenantId)) {
    const result = await getAccountThroughCoreApi(accountId)
    if (!result.ok || !result.data) {
      if (result.error === 'Account not found.') return null
      throw new Error(result.error ?? 'Account detail was not read')
    }
    const graph = result.data
    const invalidScope =
      graph.account.id !== accountId ||
      graph.account.tenantId !== tenantId ||
      graph.contacts.some(
        (row) => row.tenantId !== tenantId || row.accountId !== accountId
      ) ||
      graph.kycArtifacts.some(
        (row) => row.tenantId !== tenantId || row.accountId !== accountId
      ) ||
      graph.opportunities.some(
        (row) => row.tenantId !== tenantId || row.accountId !== accountId
      ) ||
      graph.projects.some(
        (row) => row.tenantId !== tenantId || row.accountId !== accountId
      )
    if (invalidScope) throw new Error('Account detail returned an invalid tenant scope')
    return accountDetailResultToPageData(graph)
  }

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.tenant_id, tenantId)))
    .limit(1)
  if (!account) return null

  const [contactRows, kycRows, oppRows, projectRows] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.account_id, accountId), eq(contacts.tenant_id, tenantId))
      )
      .orderBy(desc(contacts.is_primary), contacts.full_name)
      .limit(200),
    db
      .select({
        id: accountKycArtifacts.id,
        artifact_type: accountKycArtifacts.artifact_type,
        notes: accountKycArtifacts.notes,
        uploaded_at: accountKycArtifacts.uploaded_at,
        document_id: accountKycArtifacts.document_id,
        file_name: documents.file_name,
      })
      .from(accountKycArtifacts)
      .leftJoin(
        documents,
        and(
          eq(documents.id, accountKycArtifacts.document_id),
          eq(documents.tenant_id, tenantId)
        )
      )
      .where(
        and(
          eq(accountKycArtifacts.account_id, accountId),
          eq(accountKycArtifacts.tenant_id, tenantId)
        )
      )
      .orderBy(desc(accountKycArtifacts.uploaded_at))
      .limit(200),
    db
      .select({
        id: opportunities.id,
        stage: opportunities.stage,
        tcv_cents: opportunities.tcv_cents,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.account_id, accountId),
          eq(opportunities.tenant_id, tenantId)
        )
      )
      .orderBy(desc(opportunities.created_at))
      .limit(200),
    db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
      })
      .from(projects)
      .where(
        and(eq(projects.account_id, accountId), eq(projects.tenant_id, tenantId))
      )
      .orderBy(desc(projects.created_at))
      .limit(200),
  ])

  return { account, contactRows, kycRows, oppRows, projectRows }
}

export function accountDetailResultToPageData(
  result: import('@third-code-erp/shared-types').AccountDetailResult
): AccountDetailData {
  return {
    account: {
      id: result.account.id,
      tenant_id: result.account.tenantId,
      name: result.account.name,
      industry: result.account.industry,
      billing_address: result.account.billingAddress,
      primary_email: result.account.primaryEmail,
      primary_phone: result.account.primaryPhone,
      kyc_status: result.account.kycStatus,
      kyc_notes: result.account.kycNotes,
      kyc_decided_at: result.account.kycDecidedAt
        ? new Date(result.account.kycDecidedAt)
        : null,
      kyc_decided_by: result.account.kycDecidedBy,
      cnps_score_x10: result.account.cnpsScoreX10,
      created_at: new Date(result.account.createdAt),
      updated_at: new Date(result.account.updatedAt),
      created_by: result.account.createdBy,
    },
    contactRows: result.contacts.map((row) => ({
      id: row.id,
      tenant_id: row.tenantId,
      account_id: row.accountId,
      full_name: row.fullName,
      email: row.email,
      phone: row.phone,
      role_title: row.roleTitle,
      is_primary: row.isPrimary,
      created_at: new Date(row.createdAt),
      updated_at: new Date(row.updatedAt),
    })),
    kycRows: result.kycArtifacts.map((row) => ({
      id: row.id,
      artifact_type: row.artifactType,
      notes: row.notes,
      uploaded_at: new Date(row.uploadedAt),
      document_id: row.documentId,
      file_name: row.fileName,
    })),
    oppRows: result.opportunities.map((row) => ({
      id: row.id,
      stage: row.stage,
      tcv_cents: row.tcvCents,
    })),
    projectRows: result.projects.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
    })),
  }
}
