import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  accountKycArtifacts,
  contacts,
  accounts,
  documents,
  opportunities,
  projects,
  type Account,
} from '@third-code-erp/database/schema'
import {
  accountDetailResultSchema,
  accountListResultSchema,
  type AccountListQuery,
  type AccountListResult,
  type AccountReadResult,
  type AccountDetailResult,
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

  async read(
    accountId: string,
    principal: ErpPrincipal
  ): Promise<AccountDetailResult> {
    const [account] = await this.database.client
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.tenant_id, principal.tenantId)
        )
      )
      .limit(1)

    if (!account) throw new NotFoundException('Account not found')

    const [
      contactRows,
      kycRows,
      opportunityRows,
      projectRows,
      opportunityCountRows,
    ] =
      await Promise.all([
        this.database.client
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.account_id, accountId),
              eq(contacts.tenant_id, principal.tenantId)
            )
          )
          .orderBy(desc(contacts.is_primary), asc(contacts.full_name))
          .limit(200),
        this.database.client
          .select({
            id: accountKycArtifacts.id,
            tenantId: accountKycArtifacts.tenant_id,
            accountId: accountKycArtifacts.account_id,
            artifactType: accountKycArtifacts.artifact_type,
            documentId: accountKycArtifacts.document_id,
            notes: accountKycArtifacts.notes,
            uploadedAt: accountKycArtifacts.uploaded_at,
            fileName: documents.file_name,
          })
          .from(accountKycArtifacts)
          .leftJoin(
            documents,
            and(
              eq(documents.id, accountKycArtifacts.document_id),
              eq(documents.tenant_id, principal.tenantId)
            )
          )
          .where(
            and(
              eq(accountKycArtifacts.account_id, accountId),
              eq(accountKycArtifacts.tenant_id, principal.tenantId)
            )
          )
          .orderBy(desc(accountKycArtifacts.uploaded_at))
          .limit(200),
        this.database.client
          .select()
          .from(opportunities)
          .where(
            and(
              eq(opportunities.account_id, accountId),
              eq(opportunities.tenant_id, principal.tenantId)
            )
          )
          .orderBy(desc(opportunities.created_at))
          .limit(200),
        this.database.client
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.account_id, accountId),
              eq(projects.tenant_id, principal.tenantId)
            )
          )
          .orderBy(desc(projects.created_at))
          .limit(200),
        this.database.client
          .select({ count: sql<number>`count(*)::int` })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.account_id, accountId),
              eq(opportunities.tenant_id, principal.tenantId)
            )
          ),
      ])

    return accountDetailResultSchema.parse({
      account: {
        ...this.readResult({
          account,
          opportunityCount: Number(opportunityCountRows[0]?.count ?? 0),
        }),
        kycNotes: account.kyc_notes,
        kycDecidedAt: account.kyc_decided_at?.toISOString() ?? null,
        kycDecidedBy: account.kyc_decided_by,
        cnpsScoreX10: account.cnps_score_x10,
      },
      contacts: contactRows.map((contact) => ({
        id: contact.id,
        tenantId: contact.tenant_id,
        accountId: contact.account_id,
        fullName: contact.full_name,
        email: contact.email,
        phone: contact.phone,
        roleTitle: contact.role_title,
        isPrimary: contact.is_primary,
        createdAt: contact.created_at.toISOString(),
        updatedAt: contact.updated_at.toISOString(),
      })),
      kycArtifacts: kycRows.map((artifact) => ({
        id: artifact.id,
        tenantId: artifact.tenantId,
        accountId: artifact.accountId,
        artifactType: artifact.artifactType,
        documentId: artifact.documentId,
        notes: artifact.notes,
        uploadedAt: artifact.uploadedAt.toISOString(),
        fileName: artifact.fileName,
      })),
      opportunities: opportunityRows.map((opportunity) => ({
        id: opportunity.id,
        tenantId: opportunity.tenant_id,
        accountId: opportunity.account_id,
        projectId: opportunity.project_id,
        stage: opportunity.stage,
        tcvCents: opportunity.tcv_cents,
        gpCents: opportunity.gp_cents,
        probability: opportunity.probability,
        weightedTcvCents: opportunity.weighted_tcv_cents,
        areaSqm: opportunity.area_sqm,
        opportunityType: opportunity.opportunity_type,
        closingDate: opportunity.closing_date?.toISOString() ?? null,
        createdAt: opportunity.created_at.toISOString(),
        updatedAt: opportunity.updated_at.toISOString(),
      })),
      projects: projectRows.map((project) => ({
        id: project.id,
        tenantId: project.tenant_id,
        accountId: project.account_id,
        name: project.name,
        status: project.status,
        createdAt: project.created_at.toISOString(),
        updatedAt: project.updated_at.toISOString(),
      })),
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
