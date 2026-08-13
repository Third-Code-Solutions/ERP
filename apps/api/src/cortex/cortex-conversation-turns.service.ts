import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cortexConversationTurnRequests,
  cortexConversations,
  cortexMessages,
  cortexNodes,
  users,
} from '@third-code-erp/database/schema'
import {
  cortexConversationUserTurnCommandSchema,
  cortexConversationUserTurnResultSchema,
  cortexGraphRefTableMatchesType,
  isCortexGraphRefTable,
  type CortexConversationUserTurnCommand,
  type CortexConversationUserTurnResult,
  type CortexGraphRefTable,
} from '@third-code-erp/shared-types'
import { and, desc, eq, isNull } from 'drizzle-orm'
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
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

interface TurnRequestRecord {
  id: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

interface AuthorizedContext {
  refTable: CortexGraphRefTable
  refId: string
  nodeType: string
}

const REDACTION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '[email redacted]',
  ],
  [
    /\b(?:TIN|tax identification number)\s*[:#-]?\s*\d{3}[- ]?\d{3}[- ]?\d{3}(?:[- ]?\d{3})?\b/gi,
    '[tax id redacted]',
  ],
  [
    /\b\d{3}[- ]\d{3}[- ]\d{3}(?:[- ]\d{3})?\b/g,
    '[tax id redacted]',
  ],
  [/(?:\+63|0)9\d{9}\b/g, '[phone redacted]'],
]

function redactTitle(value: string): string {
  return REDACTION_RULES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value.slice(0, 80)
  ).trim()
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function commandHash(command: CortexConversationUserTurnCommand): string {
  return sha256(JSON.stringify(command))
}

function validateIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? ''
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): CortexConversationUserTurnResult {
  const parsed = cortexConversationUserTurnResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Cortex user-turn idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class CortexConversationTurnsService {
  constructor(
    @Optional()
    @Inject(ConfigService)
    private readonly config: ConfigService | undefined,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async appendUserTurn(
    command: CortexConversationUserTurnCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined
  ): Promise<CortexConversationUserTurnResult> {
    const parsedCommand = cortexConversationUserTurnCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertWriteEnabled(principal)
    const requestHash = commandHash(parsedCommand)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.lockAuthorizedPrincipal(
        transaction,
        principal
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)

      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Cortex user-turn idempotency record has an unsupported state'
        )
      }

      const existingConversation = parsedCommand.conversationId
        ? await this.lockConversation(
            transaction,
            authorizedPrincipal,
            parsedCommand.conversationId
          )
        : null

      const storedContext = existingConversation
        ? this.storedContext(existingConversation)
        : null
      if (
        parsedCommand.conversationId &&
        parsedCommand.context &&
        (!storedContext ||
          parsedCommand.context.refTable !== storedContext.refTable ||
          parsedCommand.context.refId !== storedContext.refId)
      ) {
        throw new ConflictException('Conversation context mismatch')
      }

      const requestedContext = storedContext ?? parsedCommand.context ?? null
      const authorizedContext = requestedContext
        ? await this.authorizeContext(
            transaction,
            authorizedPrincipal,
            requestedContext,
            Boolean(existingConversation)
          )
        : null

      const conversationId = existingConversation
        ? existingConversation.id
        : await this.createConversation(
            transaction,
            authorizedPrincipal,
            parsedCommand.content,
            authorizedContext
          )
      const messageId = await this.createUserMessage(
        transaction,
        authorizedPrincipal,
        conversationId,
        parsedCommand.content
      )

      if (existingConversation) {
        const [updated] = await transaction
          .update(cortexConversations)
          .set({ updated_at: new Date() })
          .where(
            and(
              eq(cortexConversations.id, conversationId),
              eq(cortexConversations.tenant_id, authorizedPrincipal.tenantId),
              eq(cortexConversations.user_id, authorizedPrincipal.userId)
            )
          )
          .returning({ id: cortexConversations.id })
        if (!updated) {
          throw new InternalServerErrorException(
            'Cortex conversation timestamp was not updated'
          )
        }
      }

      const result = cortexConversationUserTurnResultSchema.parse({
        conversationId,
        messageId,
        status: existingConversation ? 'appended' : 'created',
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'cortex_conversation',
        entityId: conversationId,
        action: existingConversation ? 'update' : 'create',
        diff: {
          turn_role: 'user',
          message_id: messageId,
          content_hash: sha256(parsedCommand.content),
          content_char_count: parsedCommand.content.length,
          context_ref_table: authorizedContext?.refTable ?? null,
          context_ref_id: authorizedContext?.refId ?? null,
          idempotency_key_hash: sha256(idempotencyKey),
        },
      })
      return result
    })
  }

  private assertWriteEnabled(principal: ErpPrincipal): void {
    const enabled =
      this.config?.get<boolean>(
        'ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED',
        false
      ) ?? false
    const allowedTenantIds =
      this.config?.get<string[]>(
        'ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS',
        []
      ) ?? []
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cortex user-turn writes are not enabled for this tenant.'
      )
    }
  }

  private async lockAuthorizedPrincipal(
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
    if (!membership || !role || !roleHasCapability(role, 'cortex.search')) {
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
    idempotencyKey: string,
    requestHash: string
  ): Promise<TurnRequestRecord> {
    await transaction
      .insert(cortexConversationTurnRequests)
      .values({
        tenant_id: principal.tenantId,
        user_id: principal.userId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
      })
      .onConflictDoNothing({
        target: [
          cortexConversationTurnRequests.tenant_id,
          cortexConversationTurnRequests.user_id,
          cortexConversationTurnRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: cortexConversationTurnRequests.id,
        requestHash: cortexConversationTurnRequests.request_hash,
        state: cortexConversationTurnRequests.state,
        result: cortexConversationTurnRequests.result,
      })
      .from(cortexConversationTurnRequests)
      .where(
        and(
          eq(cortexConversationTurnRequests.tenant_id, principal.tenantId),
          eq(cortexConversationTurnRequests.user_id, principal.userId),
          eq(
            cortexConversationTurnRequests.idempotency_key,
            idempotencyKey
          )
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Cortex user-turn idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different Cortex user turn'
      )
    }
    return request
  }

  private async lockConversation(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    conversationId: string
  ) {
    const [conversation] = await transaction
      .select({
        id: cortexConversations.id,
        contextRefTable: cortexConversations.context_ref_table,
        contextRefId: cortexConversations.context_ref_id,
      })
      .from(cortexConversations)
      .where(
        and(
          eq(cortexConversations.id, conversationId),
          eq(cortexConversations.tenant_id, principal.tenantId),
          eq(cortexConversations.user_id, principal.userId)
        )
      )
      .limit(1)
      .for('update')
    if (!conversation) throw new NotFoundException('Conversation not found')
    return conversation
  }

  private storedContext(conversation: {
    contextRefTable: string | null
    contextRefId: string | null
  }): { refTable: string; refId: string } | null {
    if (!conversation.contextRefTable && !conversation.contextRefId) return null
    if (!conversation.contextRefTable || !conversation.contextRefId) {
      throw new NotFoundException('Conversation not found')
    }
    return {
      refTable: conversation.contextRefTable,
      refId: conversation.contextRefId,
    }
  }

  private async authorizeContext(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    context: { refTable: string; refId: string },
    hideAsConversation: boolean
  ): Promise<AuthorizedContext> {
    const [node] = await transaction
      .select({
        refTable: cortexNodes.ref_table,
        refId: cortexNodes.ref_id,
        nodeType: cortexNodes.node_type,
      })
      .from(cortexNodes)
      .where(
        and(
          eq(cortexNodes.tenant_id, principal.tenantId),
          eq(cortexNodes.ref_table, context.refTable),
          eq(cortexNodes.ref_id, context.refId),
          isNull(cortexNodes.valid_to)
        )
      )
      .orderBy(desc(cortexNodes.recorded_at))
      .limit(1)
      .for('share')
    const scope = cortexSearchNodeTypeScope(principal.role)
    const refTable = node?.refTable
    if (
      !node ||
      !refTable ||
      !isCortexGraphRefTable(refTable) ||
      !cortexGraphRefTableMatchesType(refTable, node.nodeType) ||
      (scope !== null && !scope.includes(node.nodeType))
    ) {
      throw new NotFoundException(
        hideAsConversation ? 'Conversation not found' : 'Focused record not found'
      )
    }
    return {
      refTable,
      refId: node.refId,
      nodeType: node.nodeType,
    }
  }

  private async createConversation(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    content: string,
    context: AuthorizedContext | null
  ): Promise<string> {
    const [conversation] = await transaction
      .insert(cortexConversations)
      .values({
        tenant_id: principal.tenantId,
        user_id: principal.userId,
        title: redactTitle(content) || 'New conversation',
        context_ref_table: context?.refTable ?? null,
        context_ref_id: context?.refId ?? null,
      })
      .returning({ id: cortexConversations.id })
    if (!conversation) {
      throw new InternalServerErrorException(
        'Cortex conversation was not created'
      )
    }
    return conversation.id
  }

  private async createUserMessage(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    conversationId: string,
    content: string
  ): Promise<string> {
    const [message] = await transaction
      .insert(cortexMessages)
      .values({
        tenant_id: principal.tenantId,
        conversation_id: conversationId,
        role: 'user',
        content,
        citations: null,
      })
      .returning({ id: cortexMessages.id })
    if (!message) {
      throw new InternalServerErrorException('Cortex user turn was not stored')
    }
    return message.id
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CortexConversationUserTurnResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(cortexConversationTurnRequests)
      .set({
        state: 'succeeded',
        conversation_id: result.conversationId,
        message_id: result.messageId,
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(cortexConversationTurnRequests.id, requestId),
          eq(cortexConversationTurnRequests.state, 'processing')
        )
      )
      .returning({ id: cortexConversationTurnRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Cortex user-turn idempotency record changed before completion'
      )
    }
  }
}
