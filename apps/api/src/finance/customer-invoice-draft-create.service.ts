import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  boms,
  customerInvoiceDraftCreateRequests,
  invoices,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  customerInvoiceDraftCreateBodySchema,
  customerInvoiceDraftCreateResultSchema,
  type CustomerInvoiceDraftCreateBody,
  type CustomerInvoiceDraftCreateResult,
} from '@third-code-erp/shared-types'
import {
  computeEWT,
  computeRetention,
  computeVAT,
  progressBillingAmount,
} from '@third-code-erp/shared-types/bom'
import { and, desc, eq, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

const RETENTION_BPS = 1_000

type DraftCreateRequestRecord = {
  id: string
  requestHash: string
  projectId: string
  state: 'processing' | 'succeeded'
  result: unknown
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function commandHash(
  projectId: string,
  command: CustomerInvoiceDraftCreateBody
): string {
  return createHash('sha256')
    .update(canonicalJson({ projectId, command }))
    .digest('hex')
}

function validateIdempotencyKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): CustomerInvoiceDraftCreateResult {
  const parsed = customerInvoiceDraftCreateResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Customer invoice draft idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class CustomerInvoiceDraftCreateService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    projectId: string,
    body: CustomerInvoiceDraftCreateBody,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<CustomerInvoiceDraftCreateResult> {
    const parsedBody = customerInvoiceDraftCreateBodySchema.parse(body)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Customer invoice draft creation is not enabled for this tenant; no invoice was created.'
      )
    }

    const requestHash = commandHash(projectId, parsedBody)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(
        transaction,
        principal
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)

      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        projectId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Customer invoice draft idempotency record has an unsupported state'
        )
      }

      const [project] = await transaction
        .select({ id: projects.id, accountId: projects.account_id })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!project) throw new NotFoundException('Project not found')

      let bom: { id: string; projectId: string; status: string; tcvCents: number } | undefined
      if (parsedBody.bomId) {
        const [selectedBom] = await transaction
          .select({
            id: boms.id,
            projectId: boms.project_id,
            status: boms.status,
            tcvCents: boms.tcv_cents,
          })
          .from(boms)
          .where(
            and(
              eq(boms.id, parsedBody.bomId),
              eq(boms.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
          .for('update')
        if (!selectedBom) throw new NotFoundException('BOM not found')
        if (selectedBom.projectId !== project.id) {
          throw new ConflictException('BOM belongs to a different project')
        }
        if (selectedBom.status === 'draft') {
          throw new ConflictException('BOM must be approved before billing')
        }
        bom = selectedBom
      } else {
        const [latestBom] = await transaction
          .select({
            id: boms.id,
            projectId: boms.project_id,
            status: boms.status,
            tcvCents: boms.tcv_cents,
          })
          .from(boms)
          .where(
            and(
              eq(boms.project_id, project.id),
              eq(boms.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .orderBy(desc(boms.version))
          .limit(1)
        bom = latestBom
      }

      const subtotalCents = progressBillingAmount(
        Number(bom?.tcvCents ?? 0),
        parsedBody.billingPercentBps
      )
      const retentionCents = computeRetention(subtotalCents, RETENTION_BPS)
      const taxableBaseCents = subtotalCents - retentionCents
      const vatCents = computeVAT(taxableBaseCents)
      const withholdingTaxCents = computeEWT(taxableBaseCents)
      const netAmountCents =
        taxableBaseCents + vatCents - withholdingTaxCents

      const now = new Date()
      const prefix = `INV-${now.getUTCFullYear()}${String(
        now.getUTCMonth() + 1
      ).padStart(2, '0')}-`
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`invoice-number:${authorizedPrincipal.tenantId}:${prefix}`}))`
      )
      const [lastInvoice] = await transaction
        .select({ invoiceNumber: invoices.invoice_number })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenant_id, authorizedPrincipal.tenantId),
            sql`${invoices.invoice_number} like ${prefix + '%'}`
          )
        )
        .orderBy(desc(invoices.invoice_number))
        .limit(1)
      const previous = Number.parseInt(
        lastInvoice?.invoiceNumber?.split('-').at(-1) ?? '0',
        10
      )
      const next = Number.isFinite(previous) ? previous + 1 : 1
      const invoiceNumber = `${prefix}${String(next).padStart(3, '0')}`
      const dueDate = parsedBody.dueDate
        ? new Date(`${parsedBody.dueDate}T00:00:00.000Z`)
        : null

      const [created] = await transaction
        .insert(invoices)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: project.id,
          account_id: project.accountId,
          created_by: authorizedPrincipal.userId,
          invoice_number: invoiceNumber,
          status: 'draft',
          billing_percent_bps: parsedBody.billingPercentBps,
          retention_bps: RETENTION_BPS,
          subtotal_cents: subtotalCents,
          retention_cents: retentionCents,
          vat_cents: vatCents,
          withholding_tax_cents: withholdingTaxCents,
          net_amount_cents: netAmountCents,
          due_date: dueDate,
          notes: parsedBody.notes,
        })
        .returning()
      if (!created) {
        throw new InternalServerErrorException('Customer invoice draft was not created')
      }

      const result = customerInvoiceDraftCreateResultSchema.parse({
        invoiceId: created.id,
        tenantId: created.tenant_id,
        projectId: created.project_id,
        status: 'draft',
        invoiceNumber: created.invoice_number,
        billingPercentBps: created.billing_percent_bps,
        retentionBps: created.retention_bps,
        subtotalCents: created.subtotal_cents,
        retentionCents: created.retention_cents,
        vatCents: created.vat_cents,
        withholdingTaxCents: created.withholding_tax_cents,
        netAmountCents: created.net_amount_cents,
        dueDate: created.due_date?.toISOString() ?? null,
        notes: created.notes,
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'invoice',
        entityId: created.id,
        action: 'create',
        diff: {
          project_id: created.project_id,
          invoice_number: created.invoice_number,
          billing_percent_bps: created.billing_percent_bps,
          subtotal_cents: created.subtotal_cents,
          retention_cents: created.retention_cents,
          vat_cents: created.vat_cents,
          withholding_tax_cents: created.withholding_tax_cents,
          net_amount_cents: created.net_amount_cents,
          idempotency_key_hash: requestHash,
        },
      })
      return result
    })
  }

  private async authorize(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal
  ): Promise<ErpPrincipal> {
    const [membership] = await transaction
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    const role = membership?.role as ErpRole | undefined
    if (
      !membership ||
      !role ||
      !roleHasCapability(role, 'finance.issue_invoice')
    ) {
      throw new ForbiddenException()
    }
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role,
      email: membership.email,
    }
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    projectId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<DraftCreateRequestRecord> {
    await transaction
      .insert(customerInvoiceDraftCreateRequests)
      .values({
        tenant_id: principal.tenantId,
        project_id: projectId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          customerInvoiceDraftCreateRequests.tenant_id,
          customerInvoiceDraftCreateRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: customerInvoiceDraftCreateRequests.id,
        requestHash: customerInvoiceDraftCreateRequests.request_hash,
        projectId: customerInvoiceDraftCreateRequests.project_id,
        state: customerInvoiceDraftCreateRequests.state,
        result: customerInvoiceDraftCreateRequests.result,
      })
      .from(customerInvoiceDraftCreateRequests)
      .where(
        and(
          eq(customerInvoiceDraftCreateRequests.tenant_id, principal.tenantId),
          eq(customerInvoiceDraftCreateRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Customer invoice draft idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash || request.projectId !== projectId) {
      throw new ConflictException(
        'Idempotency key was already used with a different customer invoice draft command'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CustomerInvoiceDraftCreateResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(customerInvoiceDraftCreateRequests)
      .set({
        state: 'succeeded',
        invoice_id: result.invoiceId,
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(customerInvoiceDraftCreateRequests.id, requestId),
          eq(customerInvoiceDraftCreateRequests.state, 'processing')
        )
      )
      .returning({ id: customerInvoiceDraftCreateRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Customer invoice draft idempotency record changed before completion'
      )
    }
  }
}
