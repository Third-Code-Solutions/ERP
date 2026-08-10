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
  accounts,
  contracts,
  documents,
  notifications,
  opportunities,
  opportunityProjectConversionRequests,
  preConChecklistItems,
  preConChecklists,
  preConChecklistTemplates,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  opportunityProjectConversionCommandSchema,
  opportunityProjectConversionResultSchema,
  type OpportunityProjectConversionCommand,
  type OpportunityProjectConversionResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

const RECIPIENT_ROLES = ['sd_pm_pe', 'admin', 'owner'] as const

const DEFAULT_TEMPLATE = [
  { title: 'NTP issuance', owner_role: 'sd_pm_pe', sla_days: 2 },
  {
    title: 'Site mobilization checklist',
    owner_role: 'sd_pm_pe',
    sla_days: 5,
    depends_on_index: 1,
  },
  { title: 'Building Admin Vetting', owner_role: 'commercial', sla_days: 5 },
  {
    title: 'LGU Building Permit submission',
    owner_role: 'commercial',
    sla_days: 7,
    depends_on_index: 3,
  },
  { title: 'DOLE permit (if applicable)', owner_role: 'safety', sla_days: 3 },
  { title: 'Subcon shortlist', owner_role: 'procurement', sla_days: 5 },
  {
    title: 'PO issuance batch 1',
    owner_role: 'procurement',
    sla_days: 3,
    depends_on_index: 6,
  },
  { title: 'Insurance binders', owner_role: 'finance', sla_days: 2 },
  {
    title: 'Safety plan + toolbox briefing',
    owner_role: 'safety',
    sla_days: 2,
  },
  {
    title: 'Pre-Con kickoff meeting',
    owner_role: 'sd_pm_pe',
    sla_days: 1,
    depends_on_index: 1,
  },
  {
    title: 'Site office setup',
    owner_role: 'sd_pm_pe',
    sla_days: 3,
    depends_on_index: 2,
  },
  {
    title: 'Owner handover packet',
    owner_role: 'cx',
    sla_days: 1,
    depends_on_index: 10,
  },
] as const

const templateItemSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    owner_role: z.string().trim().min(1).max(64),
    sla_days: z.number().int().nonnegative(),
    depends_on_index: z.number().int().min(1).optional(),
    requires_attachment: z.boolean().optional(),
  })
  .strict()

const templateSchema = z.array(templateItemSchema).min(1).max(100)

type TemplateItem = z.infer<typeof templateItemSchema>
type ConversionRequestRecord = {
  id: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
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
  opportunityId: string,
  command: OpportunityProjectConversionCommand
): string {
  return createHash('sha256')
    .update(canonicalJson({ command, opportunityId }))
    .digest('hex')
}

function validateIdempotencyKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): OpportunityProjectConversionResult {
  const parsed = opportunityProjectConversionResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Opportunity project conversion idempotency result is invalid'
    )
  }
  return parsed.data
}

function parseTemplate(raw: string | null | undefined): TemplateItem[] {
  if (typeof raw !== 'string') return [...DEFAULT_TEMPLATE]
  try {
    const parsed = templateSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : [...DEFAULT_TEMPLATE]
  } catch {
    return [...DEFAULT_TEMPLATE]
  }
}

@Injectable()
export class OpportunityProjectConversionService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async convert(
    opportunityId: string,
    command: OpportunityProjectConversionCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<OpportunityProjectConversionResult> {
    const parsedCommand = opportunityProjectConversionCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertWritesEnabled(principal)
    const requestHash = commandHash(opportunityId, parsedCommand)
    return this.database.client.transaction((transaction) =>
      this.convertWithinTransactionParsed(
        transaction,
        opportunityId,
        parsedCommand,
        principal,
        idempotencyKey,
        requestHash
      )
    )
  }

  /**
   * Runs the same conversion authority inside a caller-owned transaction.
   * Stage transitions use this to keep the won handoff atomic with the stage
   * update; the normal endpoint above remains the public conversion boundary.
   */
  async convertWithinTransaction(
    transaction: DatabaseTransaction,
    opportunityId: string,
    command: OpportunityProjectConversionCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<OpportunityProjectConversionResult> {
    const parsedCommand = opportunityProjectConversionCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertWritesEnabled(principal)
    const requestHash = commandHash(opportunityId, parsedCommand)
    return this.convertWithinTransactionParsed(
      transaction,
      opportunityId,
      parsedCommand,
      principal,
      idempotencyKey,
      requestHash
    )
  }

  private assertWritesEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Won-to-Project handoff is not enabled for this tenant; no Project was created.'
      )
    }
  }

  private async convertWithinTransactionParsed(
    transaction: DatabaseTransaction,
    opportunityId: string,
    parsedCommand: OpportunityProjectConversionCommand,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<OpportunityProjectConversionResult> {
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
      if (!membership || !role || !roleHasCapability(role, 'opportunity.convert')) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      const [opportunity] = await transaction
        .select({
          id: opportunities.id,
          tenantId: opportunities.tenant_id,
          stage: opportunities.stage,
          accountId: opportunities.account_id,
          projectId: opportunities.project_id,
          opportunityType: opportunities.opportunity_type,
        })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(opportunities.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!opportunity) throw new NotFoundException('Opportunity not found')

      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        opportunityId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Opportunity project conversion idempotency record has an unsupported state'
        )
      }

      if (opportunity.stage !== 'won' && opportunity.stage !== 'closed_won') {
        throw new ConflictException(
          `Opportunity must be in 'won' stage; got '${opportunity.stage}'`
        )
      }

      let accountName: string | null = null
      if (opportunity.accountId) {
        const [account] = await transaction
          .select({ name: accounts.name })
          .from(accounts)
          .where(
            and(
              eq(accounts.id, opportunity.accountId),
              eq(accounts.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
          .for('share')
        accountName = account?.name ?? null
      }

      let projectId = opportunity.projectId
      let createdProject = false
      if (!projectId) {
        const clientName = accountName ?? 'Unknown client'
        const projectName = opportunity.opportunityType?.trim() || clientName
        const [created] = await transaction
          .insert(projects)
          .values({
            tenant_id: authorizedPrincipal.tenantId,
            account_id: opportunity.accountId ?? null,
            name: projectName,
            client: clientName,
            status: 'active',
            created_by: authorizedPrincipal.userId,
          })
          .returning({ id: projects.id })
        if (!created) {
          throw new InternalServerErrorException(
            'Failed to create Project from won Opportunity'
          )
        }
        projectId = created.id
        createdProject = true
        await transaction
          .update(opportunities)
          .set({ project_id: projectId, updated_at: new Date() })
          .where(
            and(
              eq(opportunities.id, opportunityId),
              eq(opportunities.tenant_id, authorizedPrincipal.tenantId)
            )
          )
      } else {
        const [project] = await transaction
          .select({ id: projects.id, status: projects.status })
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
        await this.verifySignedContract(
          transaction,
          authorizedPrincipal.tenantId,
          projectId
        )
        if (project.status === 'lead') {
          await transaction
            .update(projects)
            .set({ status: 'active', updated_at: new Date() })
            .where(
              and(
                eq(projects.id, projectId),
                eq(projects.tenant_id, authorizedPrincipal.tenantId),
                eq(projects.status, 'lead')
              )
            )
        }
      }

      const checklist = await this.ensureChecklist(
        transaction,
        authorizedPrincipal.tenantId,
        projectId
      )

      if (createdProject || checklist.created) {
        const recipients = await transaction
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(
            and(
              eq(users.tenant_id, authorizedPrincipal.tenantId),
              inArray(users.role, [...RECIPIENT_ROLES])
            )
          )
        if (recipients.length > 0) {
          await transaction.insert(notifications).values(
            recipients.map((recipient) => ({
              tenant_id: authorizedPrincipal.tenantId,
              recipient_user_id: recipient.id,
              recipient_email: recipient.email,
              channel: 'in_app' as const,
              subject: 'Project created from won opportunity',
              body:
                'A new project has been auto-created. The Pre-Construction checklist is ready to action.',
              link_url: `/projects/${projectId}`,
              payload: {
                event: 'opportunity.won.project_conversion',
                opportunity_id: opportunityId,
                project_id: projectId,
                checklist_id: checklist.id,
              },
            }))
          )
        }
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'opportunity',
        entityId: opportunityId,
        action: 'status_change',
        diff: {
          won: true,
          project_id: projectId,
          source: 'opportunity_won_core',
          idempotency_key_hash: requestHash,
        },
      })
      if (createdProject) {
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'project',
          entityId: projectId,
          action: 'create',
          diff: {
            source: 'opportunity_won_core',
            opportunity_id: opportunityId,
          },
        })
      }
      if (checklist.created) {
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'pre_con_checklist',
          entityId: checklist.id,
          action: 'create',
          diff: {
            source: 'opportunity_won_core',
            project_id: projectId,
            item_count: checklist.itemCount,
          },
        })
      }

      const result = opportunityProjectConversionResultSchema.parse({
        ok: true,
        opportunityId,
        projectId,
        checklistId: checklist.id,
        tenantId: authorizedPrincipal.tenantId,
        createdProject,
      })
      await this.completeRequest(transaction, request.id, result)
      return result
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    opportunityId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<ConversionRequestRecord> {
    await transaction
      .insert(opportunityProjectConversionRequests)
      .values({
        tenant_id: principal.tenantId,
        opportunity_id: opportunityId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          opportunityProjectConversionRequests.tenant_id,
          opportunityProjectConversionRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: opportunityProjectConversionRequests.id,
        requestHash: opportunityProjectConversionRequests.request_hash,
        state: opportunityProjectConversionRequests.state,
        result: opportunityProjectConversionRequests.result,
      })
      .from(opportunityProjectConversionRequests)
      .where(
        and(
          eq(
            opportunityProjectConversionRequests.tenant_id,
            principal.tenantId
          ),
          eq(
            opportunityProjectConversionRequests.idempotency_key,
            idempotencyKey
          )
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Opportunity project conversion idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different Opportunity command'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: OpportunityProjectConversionResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(opportunityProjectConversionRequests)
      .set({
        state: 'succeeded',
        project_id: result.projectId,
        checklist_id: result.checklistId,
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(opportunityProjectConversionRequests.id, requestId),
          eq(opportunityProjectConversionRequests.state, 'processing')
        )
      )
      .returning({ id: opportunityProjectConversionRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Opportunity project conversion idempotency record changed before completion'
      )
    }
  }

  private async verifySignedContract(
    transaction: DatabaseTransaction,
    tenantId: string,
    projectId: string
  ): Promise<void> {
    const [signed] = await transaction
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenant_id, tenantId),
          eq(contracts.project_id, projectId),
          eq(contracts.status, 'signed')
        )
      )
      .limit(1)
      .for('share')
    if (signed) return

    const [legacy] = await transaction
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.tenant_id, tenantId),
          eq(documents.project_id, projectId),
          eq(documents.document_type, 'contract')
        )
      )
      .limit(1)
      .for('share')
    if (legacy) return

    throw new ConflictException(
      'Cannot convert to project: no signed contract or contract document found on this opportunity.'
    )
  }

  private async ensureChecklist(
    transaction: DatabaseTransaction,
    tenantId: string,
    projectId: string
  ): Promise<{ id: string; created: boolean; itemCount: number }> {
    const [existing] = await transaction
      .select({ id: preConChecklists.id })
      .from(preConChecklists)
      .where(
        and(
          eq(preConChecklists.tenant_id, tenantId),
          eq(preConChecklists.project_id, projectId)
        )
      )
      .limit(1)
      .for('update')
    if (existing) {
      const items = await transaction
        .select({ id: preConChecklistItems.id })
        .from(preConChecklistItems)
        .where(
          and(
            eq(preConChecklistItems.tenant_id, tenantId),
            eq(preConChecklistItems.checklist_id, existing.id)
          )
        )
        .for('share')
      return { id: existing.id, created: false, itemCount: items.length }
    }

    const [template] = await transaction
      .select({ id: preConChecklistTemplates.id, items: preConChecklistTemplates.items })
      .from(preConChecklistTemplates)
      .where(
        and(
          eq(preConChecklistTemplates.tenant_id, tenantId),
          eq(preConChecklistTemplates.is_active, true)
        )
      )
      .limit(1)
      .for('share')
    const items = parseTemplate(template?.items)
    const [checklist] = await transaction
      .insert(preConChecklists)
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        template_id: template?.id,
      })
      .returning({ id: preConChecklists.id })
    if (!checklist) {
      throw new InternalServerErrorException(
        'Failed to create pre-con checklist row'
      )
    }

    const now = new Date()
    const inserted = await transaction
      .insert(preConChecklistItems)
      .values(
        items.map((item, index) => ({
          tenant_id: tenantId,
          checklist_id: checklist.id,
          title: item.title,
          owner_role: item.owner_role,
          sla_days: item.sla_days,
          sort_order: index,
          sla_clock_started_at: item.depends_on_index ? null : now,
        }))
      )
      .returning({ id: preConChecklistItems.id, sortOrder: preConChecklistItems.sort_order })
    if (inserted.length !== items.length) {
      throw new InternalServerErrorException(
        'Pre-con checklist items were not created'
      )
    }

    const byOrder = new Map(inserted.map((item) => [item.sortOrder, item.id]))
    for (let index = 0; index < items.length; index += 1) {
      const dependency = items[index]?.depends_on_index
      if (!dependency) continue
      const itemId = byOrder.get(index)
      const dependencyId = byOrder.get(dependency - 1)
      if (!itemId || !dependencyId) continue
      await transaction
        .update(preConChecklistItems)
        .set({ depends_on_item_id: dependencyId })
        .where(
          and(
            eq(preConChecklistItems.id, itemId),
            eq(preConChecklistItems.tenant_id, tenantId),
            eq(preConChecklistItems.checklist_id, checklist.id)
          )
        )
    }
    return { id: checklist.id, created: true, itemCount: items.length }
  }
}
