import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  auditLog,
  documents,
  invoices,
  progressClaims,
  projects,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import {
  CLAIM_LINKABLE_INVOICE_STATUSES,
  CLAIM_PAYABLE_INVOICE_STATUSES,
  claimInvoiceAmountMismatch,
  claimTransitionCommandReceiptSchema,
  claimTransitionCommandSchema,
  claimTransitionPayload,
  claimTransitionResultSchema,
  type ClaimTransitionCommand,
  type ClaimTransitionCommandReceipt,
  type ClaimTransitionResult,
  type ClaimTransitionStatus,
} from '@third-code-erp/shared-types'
import { ERP_ROLES, roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { and, eq, isNull, ne, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

const COMMAND_ENTITY = 'progress_claim_transition_command'
const COMMAND_ACTION = 'status_change'
const COMMERCIAL_ROLES = new Set(['admin', 'owner', 'commercial'])
const FINANCE_ROLES = new Set(['admin', 'owner', 'finance'])
const TERMINAL_STATUSES = new Set<ClaimTransitionStatus>(['paid', 'rejected', 'cancelled'])
// Mirrors the partial unique index ux_progress_claims_tenant_invoice_live.
const RELEASED_CLAIM_STATUSES: ClaimTransitionStatus[] = ['rejected', 'cancelled']
const INVOICE_ALREADY_LINKED = 'That invoice is already linked to another claim'
const INVOICE_LIVE_CLAIM_INDEX = 'ux_progress_claims_tenant_invoice_live'

function pgError(error: unknown): { code: string; constraint_name?: unknown } | undefined {
  const seen = new Set<object>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if ('code' in current && typeof current.code === 'string') return current as { code: string; constraint_name?: unknown }
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

function hashPayload(claimId: string, command: ClaimTransitionCommand): string {
  return createHash('sha256').update(claimTransitionPayload(claimId, command)).digest('hex')
}

function targetStatus(action: ClaimTransitionCommand['action']): ClaimTransitionStatus {
  switch (action) {
    case 'submit': return 'submitted'
    case 'certificate_pending': return 'certificate_pending'
    case 'certify': return 'certified'
    case 'handover': return 'handed_over_finance'
    case 'link_invoice': return 'invoiced'
    case 'record_payment': return 'paid'
    case 'reject': return 'rejected'
    case 'cancel': return 'cancelled'
  }
}

function capabilityAllowed(role: ErpRole, action: ClaimTransitionCommand['action']): boolean {
  if (action === 'submit') return roleHasCapability(role, 'precon.manage_checklist') || roleHasCapability(role, 'po.create')
  if (action === 'reject' || action === 'cancel') {
    return roleHasCapability(role, 'po.create') || roleHasCapability(role, 'precon.manage_checklist') || roleHasCapability(role, 'finance.issue_invoice')
  }
  if (action === 'link_invoice' || action === 'record_payment') return FINANCE_ROLES.has(role)
  return COMMERCIAL_ROLES.has(role)
}

type ClaimUpdatePatch = Partial<typeof progressClaims.$inferInsert>

@Injectable()
export class ClaimTransitionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async transition(
    claimIdInput: string,
    commandInput: ClaimTransitionCommand,
    principal: ErpPrincipal,
  ): Promise<ClaimTransitionResult> {
    const claimId = z.string().uuid().parse(claimIdInput).toLowerCase()
    const command = claimTransitionCommandSchema.parse(commandInput)
    const payloadHash = hashPayload(claimId, command)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.client.transaction(async (transaction) => {
          const actor = await this.admit(transaction, principal, command.action)
          const [claim] = await transaction
            .select({
              id: progressClaims.id,
              projectId: progressClaims.project_id,
              status: progressClaims.status,
              invoiceId: progressClaims.invoice_id,
              amountCents: progressClaims.amount_cents,
            })
            .from(progressClaims)
            .where(and(eq(progressClaims.id, claimId), eq(progressClaims.tenant_id, actor.tenantId)))
            .limit(1)
            .for('update', { noWait: true })
          if (!claim) throw new NotFoundException('Progress claim not found')

          const [project] = await transaction
            .select({ id: projects.id })
            .from(projects)
            .where(and(
              eq(projects.id, claim.projectId),
              eq(projects.tenant_id, actor.tenantId),
              isNull(projects.deleted_at),
            ))
            .limit(1)
            .for('share', { noWait: true })
          if (!project) throw new NotFoundException('Active claim project not found')

          const replay = await this.findReceipt(transaction, actor, claimId, claim.projectId, command.clientRequestId, payloadHash)
          if (replay) return claimTransitionResultSchema.parse({ claimId, changed: false, receipt: replay })

          this.assertTransitionAllowed(claim.status, command.action)
          if (command.action === 'certify') await this.assertCertificateDocument(transaction, actor, claim.projectId, command.certificateDocumentId)
          if (command.action === 'link_invoice') await this.assertInvoice(transaction, actor, claim, command.invoiceId)
          if (command.action === 'record_payment') await this.assertInvoiceReceived(transaction, actor, claim.invoiceId)

          const now = await this.databaseClock(transaction)
          const patch = this.patchFor(command, actor.userId, now)
          const [updated] = await transaction
            .update(progressClaims)
            .set(patch)
            .where(and(
              eq(progressClaims.id, claimId),
              eq(progressClaims.tenant_id, actor.tenantId),
              eq(progressClaims.status, claim.status),
            ))
            .returning({ id: progressClaims.id })
          if (!updated) throw new ConflictException('Claim changed before this action completed; retry the unchanged command')

          const receipt = claimTransitionCommandReceiptSchema.parse({
            schemaVersion: 1,
            operation: 'transition',
            tenantId: actor.tenantId,
            actorId: actor.userId,
            claimId,
            projectId: claim.projectId,
            clientRequestId: command.clientRequestId,
            payloadHash,
            action: command.action,
            fromStatus: claim.status,
            toStatus: targetStatus(command.action),
            changedAt: now.toISOString(),
          })
          await this.audit.writeSemantic(transaction, {
            tenantId: actor.tenantId,
            actorId: actor.userId,
            entityType: COMMAND_ENTITY,
            entityId: command.clientRequestId,
            action: COMMAND_ACTION,
            diff: { schemaVersion: 1, payloadHash, receipt },
          })
          return claimTransitionResultSchema.parse({ claimId, changed: true, receipt })
        })
      } catch (error) {
        const pg = pgError(error)
        const code = pg?.code
        // Only the live-claim index means "already linked"; any other unique violation stays an error.
        if (code === '23505' && pg?.constraint_name === INVOICE_LIVE_CLAIM_INDEX) throw new ConflictException(INVOICE_ALREADY_LINKED)
        if ((code === '55P03' || code === '40P01') && attempt < 2) continue
        if (code === '55P03' || code === '40P01') throw new ConflictException('Claim authority is changing; retry the unchanged command')
        throw error
      }
    }
    throw new ConflictException('Claim authority is changing; retry the unchanged command')
  }

  private async admit(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    action: ClaimTransitionCommand['action'],
  ): Promise<ErpPrincipal> {
    await transaction.execute(sql`select set_config('lock_timeout', '3s', true)`)
    const [actor] = await transaction
      .select({ role: users.role, status: users.account_status, email: users.email })
      .from(users)
      .where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId)))
      .limit(1)
      .for('share', { noWait: true })
    const role = z.enum(ERP_ROLES).safeParse(actor?.role)
    if (!actor || actor.status !== 'active' || !role.success || !capabilityAllowed(role.data, action)) throw new ForbiddenException()
    const [tenant] = await transaction
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, principal.tenantId))
      .limit(1)
      .for('share', { noWait: true })
    if (tenant?.status !== 'active') throw new ForbiddenException('Current tenant is not active')
    const admitted: ErpPrincipal = { userId: principal.userId.toLowerCase(), tenantId: principal.tenantId.toLowerCase(), role: role.data, email: actor.email }
    await this.audit.stampActor(transaction, admitted)
    if (!await this.audit.tryLockTenantChain(transaction, admitted.tenantId)) throw new ConflictException('Claim writes are busy; retry the unchanged command')
    return admitted
  }

  private assertTransitionAllowed(status: ClaimTransitionStatus, action: ClaimTransitionCommand['action']): void {
    if (action === 'reject' && status === 'invoiced') {
      throw new ConflictException('An invoiced claim cannot be rejected. Void its invoice first with Reverse invoice in Finance.')
    }
    const allowed = action === 'submit' ? status === 'draft'
      : action === 'certificate_pending' ? status === 'submitted'
        : action === 'certify' ? status === 'submitted' || status === 'certificate_pending'
          : action === 'handover' ? status === 'certified'
            : action === 'link_invoice' ? status === 'handed_over_finance'
              : action === 'record_payment' ? status === 'invoiced'
                : action === 'cancel' ? status === 'draft'
                  : !TERMINAL_STATUSES.has(status)
    if (!allowed) throw new ConflictException(`Cannot ${action} a claim in status "${status}"`)
  }

  private patchFor(command: ClaimTransitionCommand, actorId: string, now: Date): ClaimUpdatePatch {
    switch (command.action) {
      case 'submit': return { status: 'submitted', submitted_at: now, submitted_by: actorId, updated_at: now }
      case 'certificate_pending': return { status: 'certificate_pending', updated_at: now }
      case 'certify': return { status: 'certified', certified_at: now, certified_by: actorId, certificate_document_id: command.certificateDocumentId, updated_at: now }
      case 'handover': return { status: 'handed_over_finance', handed_over_to_finance_at: now, handed_over_to_finance_by: actorId, updated_at: now }
      case 'link_invoice': return { status: 'invoiced', invoice_id: command.invoiceId, updated_at: now }
      case 'record_payment': return { status: 'paid', paid_at: now, updated_at: now }
      case 'reject': return { status: 'rejected', rejected_at: now, rejected_reason: command.reason, updated_at: now }
      case 'cancel': return { status: 'cancelled', rejected_reason: command.reason, updated_at: now }
    }
  }

  private async assertCertificateDocument(transaction: DatabaseTransaction, actor: ErpPrincipal, projectId: string, documentId: string): Promise<void> {
    const [document] = await transaction
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.tenant_id, actor.tenantId), eq(documents.project_id, projectId)))
      .limit(1)
      .for('share', { noWait: true })
    if (!document) throw new NotFoundException('Certificate document not found in the claim project')
  }

  private async assertInvoice(
    transaction: DatabaseTransaction,
    actor: ErpPrincipal,
    claim: { id: string; projectId: string; amountCents: number },
    invoiceId: string,
  ): Promise<void> {
    const [invoice] = await transaction
      .select({
        id: invoices.id,
        number: invoices.invoice_number,
        status: invoices.status,
        reversedAt: invoices.reversed_at,
        subtotalCents: invoices.subtotal_cents,
      })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenant_id, actor.tenantId), eq(invoices.project_id, claim.projectId)))
      .limit(1)
      .for('share', { noWait: true })
    if (!invoice) throw new NotFoundException('Invoice not found in the claim project')
    if (invoice.reversedAt) throw new ConflictException(`Invoice ${invoice.number} was reversed and cannot be linked to a claim`)
    // A reversed invoice keeps its status and carries reversed_at, so status alone is not enough.
    if (!CLAIM_LINKABLE_INVOICE_STATUSES.includes(invoice.status)) {
      throw new ConflictException(
        invoice.status === 'draft'
          ? `Invoice ${invoice.number} is still a draft; issue it before linking it to a claim`
          : `Invoice ${invoice.number} is ${invoice.status} and cannot be linked to a claim`,
      )
    }
    const [other] = await transaction
      .select({ claimNumber: progressClaims.claim_number })
      .from(progressClaims)
      .where(and(
        eq(progressClaims.tenant_id, actor.tenantId),
        eq(progressClaims.invoice_id, invoiceId),
        ne(progressClaims.id, claim.id),
        notInArray(progressClaims.status, RELEASED_CLAIM_STATUSES),
      ))
      .limit(1)
    if (other) throw new ConflictException(`Invoice ${invoice.number} is already linked to claim ${other.claimNumber}`)
    const mismatch = claimInvoiceAmountMismatch(claim.amountCents, invoice.subtotalCents)
    if (mismatch) throw new ConflictException(mismatch)
  }

  // Progress claims are routinely paid in parts (retention, staggered releases), so one posted
  // receipt is enough; the claim page derives partially paid or paid in full from the invoice.
  private async assertInvoiceReceived(transaction: DatabaseTransaction, actor: ErpPrincipal, invoiceId: string | null): Promise<void> {
    if (!invoiceId) throw new ConflictException('This claim has no linked invoice')
    const [invoice] = await transaction
      .select({ number: invoices.invoice_number, status: invoices.status, reversedAt: invoices.reversed_at })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenant_id, actor.tenantId)))
      .limit(1)
      .for('share', { noWait: true })
    if (!invoice) throw new NotFoundException('Linked invoice not found')
    if (invoice.reversedAt) throw new ConflictException(`Invoice ${invoice.number} was reversed; a reversed invoice cannot carry a claim payment`)
    if (!CLAIM_PAYABLE_INVOICE_STATUSES.includes(invoice.status)) {
      throw new ConflictException(`Invoice ${invoice.number} has no customer payment yet; record the receipt in Finance first`)
    }
  }

  private async databaseClock(transaction: DatabaseTransaction): Promise<Date> {
    const [row] = await transaction.execute<{ now: string }>(sql`select clock_timestamp()::text as now`)
    const value = new Date(row?.now ?? '')
    if (!Number.isFinite(value.getTime())) throw new InternalServerErrorException('Database clock unavailable')
    return value
  }

  private async findReceipt(
    transaction: DatabaseTransaction,
    actor: ErpPrincipal,
    claimId: string,
    projectId: string,
    requestId: string,
    payloadHash: string,
  ): Promise<ClaimTransitionCommandReceipt | undefined> {
    const rows = await transaction
      .select({ actorId: auditLog.actor_id, action: auditLog.action, diff: auditLog.diff })
      .from(auditLog)
      .where(and(eq(auditLog.tenant_id, actor.tenantId), eq(auditLog.entity_type, COMMAND_ENTITY), eq(auditLog.entity_id, requestId)))
      .limit(2)
    if (!rows.length) return undefined
    const stored = z.object({ schemaVersion: z.literal(1), payloadHash: z.string(), receipt: claimTransitionCommandReceiptSchema }).strict().safeParse(rows[0]?.diff)
    if (rows.length !== 1 || !stored.success || rows[0]?.action !== COMMAND_ACTION) throw new ConflictException('Claim transition command receipt requires reconciliation')
    const receipt = stored.data.receipt
    if (rows[0]?.actorId !== actor.userId || stored.data.payloadHash !== payloadHash || receipt.payloadHash !== payloadHash || receipt.tenantId !== actor.tenantId || receipt.actorId !== actor.userId || receipt.claimId !== claimId || receipt.projectId !== projectId || receipt.clientRequestId !== requestId) {
      throw new ConflictException('Client request id was already used by another claim transition')
    }
    return receipt
  }
}
