import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cortexAssistantTurnRequests,
  cortexAssistantGenerationJobs,
  cortexConversationTurnRequests,
  cortexConversations,
  cortexMessages,
  cortexNodes,
  getCortexCitationsByNodeIds,
  users,
} from '@third-code-erp/database'
import {
  CORTEX_ASSISTANT_TURN_SIGNATURE_MAX_AGE_SECONDS,
  CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION,
  cortexConversationAssistantTurnClaimCommandSchema,
  cortexConversationAssistantTurnClaimResultSchema,
  cortexConversationAssistantTurnCompleteCommandSchema,
  cortexConversationAssistantTurnCompleteResultSchema,
  cortexConversationAssistantTurnSignaturePayload,
  cortexGraphRefTableMatchesType,
  isCortexGraphRefTable,
  type CortexConversationAssistantTurnClaimCommand,
  type CortexConversationAssistantTurnClaimResult,
  type CortexConversationAssistantTurnCompleteCommand,
  type CortexConversationAssistantTurnCompleteResult,
  type CortexConversationAssistantTurnOutcome,
  cortexAssistantGenerationStartCommandSchema,
  type CortexAssistantGenerationStartCommand,
  cortexAssistantGenerationWorkerCompletionSchema,
  type CortexGraphRefTable,
} from '@third-code-erp/shared-types'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
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

export interface CortexAssistantTurnSignatureHeaders {
  timestamp: string | undefined
  signature: string | undefined
}

interface AuthorizedContext {
  refTable: CortexGraphRefTable
  refId: string
}

interface ClaimedRequest {
  status: 'claimed'
  conversationId: string
  userMessageId: string
  requestId: string
  claimToken: string
  leaseExpiresAt: string
}

interface InProgressRequest {
  status: 'in_progress'
  conversationId: string
  userMessageId: string
  retryAfterSeconds: number
}

interface SucceededRequest {
  status: 'succeeded'
  authorizedRole: ErpRole
  conversationId: string
  userMessageId: string
  messageId: string
  content: string
  citationNodeIds: string[]
  outcome: CortexConversationAssistantTurnOutcome
  model: string
}

type InternalClaimResult =
  | ClaimedRequest
  | InProgressRequest
  | SucceededRequest

const CLAIM_LEASE_MS = 60_000

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function commandDigest(command: object): string {
  return sha256(JSON.stringify(command))
}

function validateIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? ''
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function storedCitationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = value.flatMap((candidate) => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !('nodeId' in candidate) ||
      typeof candidate.nodeId !== 'string'
    ) {
      return []
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate.nodeId
    )
      ? [candidate.nodeId]
      : []
  })
  return [...new Set(ids)].slice(0, 12)
}

@Injectable()
export class CortexAssistantTurnsService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async claim(
    command: CortexConversationAssistantTurnClaimCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
    headers: CortexAssistantTurnSignatureHeaders
  ): Promise<CortexConversationAssistantTurnClaimResult> {
    const parsedCommand =
      cortexConversationAssistantTurnClaimCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertWriteEnabled(principal)
    this.verifySignature(
      'claim',
      parsedCommand,
      principal,
      idempotencyKey,
      headers
    )
    const requestHash = commandDigest(parsedCommand)
    const internal = await this.database.client.transaction(
      async (transaction): Promise<InternalClaimResult> => {
        const authorizedPrincipal = await this.lockAuthorizedPrincipal(
          transaction,
          principal
        )
        await this.audit.stampActor(transaction, authorizedPrincipal)
        const conversation = await this.lockConversation(
          transaction,
          authorizedPrincipal,
          parsedCommand.conversationId
        )
        await this.authorizeStoredContext(
          transaction,
          authorizedPrincipal,
          conversation
        )
        await this.lockOfficialUserTurn(
          transaction,
          authorizedPrincipal,
          parsedCommand.conversationId,
          parsedCommand.userMessageId
        )
        const result = await this.claimOrReplay(
          transaction,
          authorizedPrincipal,
          parsedCommand,
          idempotencyKey,
          requestHash,
          new Date()
        )
        if (result.status === 'claimed') {
          await this.audit.writeSemantic(transaction, {
            tenantId: authorizedPrincipal.tenantId,
            actorId: authorizedPrincipal.userId,
            entityType: 'cortex_conversation',
            entityId: result.conversationId,
            action: 'update',
            diff: {
              assistant_generation_state: 'claimed',
              user_message_id: result.userMessageId,
              request_id: result.requestId,
              lease_expires_at: result.leaseExpiresAt,
              idempotency_key_hash: sha256(idempotencyKey),
            },
          })
        }
        return result
      }
    )

    if (internal.status !== 'succeeded') {
      return cortexConversationAssistantTurnClaimResultSchema.parse(internal)
    }
    const citations = await getCortexCitationsByNodeIds(
      principal.tenantId,
      internal.citationNodeIds,
      cortexSearchNodeTypeScope(internal.authorizedRole)
    )
    return cortexConversationAssistantTurnClaimResultSchema.parse({
      status: internal.status,
      conversationId: internal.conversationId,
      userMessageId: internal.userMessageId,
      messageId: internal.messageId,
      content: internal.content,
      citations,
      outcome: internal.outcome,
      model: internal.model,
    })
  }

  authorizeGenerationStart(
    command: CortexAssistantGenerationStartCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
    headers: CortexAssistantTurnSignatureHeaders
  ): string {
    const parsedCommand =
      cortexAssistantGenerationStartCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertWriteEnabled(principal)
    this.verifySignature(
      'start_job',
      parsedCommand,
      principal,
      idempotencyKey,
      headers
    )
    return idempotencyKey
  }

  async complete(
    command: CortexConversationAssistantTurnCompleteCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
    headers: CortexAssistantTurnSignatureHeaders
  ): Promise<CortexConversationAssistantTurnCompleteResult> {
    const parsedCommand =
      cortexConversationAssistantTurnCompleteCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertWriteEnabled(principal)
    this.verifySignature(
      'complete',
      parsedCommand,
      principal,
      idempotencyKey,
      headers
    )
    const completionHash = commandDigest(parsedCommand)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.lockAuthorizedPrincipal(
        transaction,
        principal
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.lockRequest(
        transaction,
        authorizedPrincipal,
        parsedCommand.requestId,
        idempotencyKey
      )
      const now = new Date()
      if (request.state === 'succeeded') {
        if (request.completionHash !== completionHash) {
          throw new ConflictException(
            'Assistant-turn completion changed after it succeeded'
          )
        }
        return cortexConversationAssistantTurnCompleteResultSchema.parse(
          request.result
        )
      }
      if (
        request.claimTokenHash !== sha256(parsedCommand.claimToken) ||
        !request.leaseExpiresAt ||
        request.leaseExpiresAt.getTime() <= now.getTime()
      ) {
        throw new ConflictException(
          'Assistant-turn generation claim is stale or invalid'
        )
      }

      const conversation = await this.lockConversation(
        transaction,
        authorizedPrincipal,
        request.conversationId
      )
      await this.authorizeStoredContext(
        transaction,
        authorizedPrincipal,
        conversation
      )
      await this.lockOfficialUserTurn(
        transaction,
        authorizedPrincipal,
        request.conversationId,
        request.userMessageId
      )
      await this.authorizeCitations(
        transaction,
        authorizedPrincipal,
        parsedCommand.citationNodeIds
      )

      const [message] = await transaction
        .insert(cortexMessages)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          conversation_id: request.conversationId,
          role: 'assistant',
          content: parsedCommand.content,
          citations: parsedCommand.citationNodeIds.map((nodeId) => ({ nodeId })),
        })
        .returning({ id: cortexMessages.id })
      if (!message) {
        throw new InternalServerErrorException(
          'Cortex assistant turn was not stored'
        )
      }

      const [updatedConversation] = await transaction
        .update(cortexConversations)
        .set({ updated_at: now })
        .where(
          and(
            eq(cortexConversations.id, request.conversationId),
            eq(cortexConversations.tenant_id, authorizedPrincipal.tenantId),
            eq(cortexConversations.user_id, authorizedPrincipal.userId)
          )
        )
        .returning({ id: cortexConversations.id })
      if (!updatedConversation) {
        throw new InternalServerErrorException(
          'Cortex conversation timestamp was not updated'
        )
      }

      const result = cortexConversationAssistantTurnCompleteResultSchema.parse({
        status: 'created',
        conversationId: request.conversationId,
        userMessageId: request.userMessageId,
        messageId: message.id,
      })
      const [completed] = await transaction
        .update(cortexAssistantTurnRequests)
        .set({
          state: 'succeeded',
          completion_hash: completionHash,
          claim_token_hash: null,
          lease_expires_at: null,
          assistant_message_id: message.id,
          outcome: parsedCommand.outcome,
          model: parsedCommand.model,
          result,
          completed_at: now,
        })
        .where(
          and(
            eq(cortexAssistantTurnRequests.id, request.id),
            eq(cortexAssistantTurnRequests.state, 'processing')
          )
        )
        .returning({ id: cortexAssistantTurnRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Cortex assistant-turn request changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'cortex_conversation',
        entityId: request.conversationId,
        action: 'update',
        diff: {
          turn_role: 'assistant',
          user_message_id: request.userMessageId,
          message_id: message.id,
          response_hash: sha256(parsedCommand.content),
          response_char_count: parsedCommand.content.length,
          citation_node_ids: parsedCommand.citationNodeIds,
          citation_count: parsedCommand.citationNodeIds.length,
          outcome: parsedCommand.outcome,
          model: parsedCommand.model,
          idempotency_key_hash: sha256(idempotencyKey),
        },
      })
      return result
    })
  }

  async completeFromWorker(input: {
    jobId: string
    requestId: string
    claimTokenHash: string
    content: string
    citationNodeIds: string[]
    model: string
  }): Promise<boolean> {
    const parsedCompletion =
      cortexAssistantGenerationWorkerCompletionSchema.parse({
        content: input.content,
        citationNodeIds: input.citationNodeIds,
        model: input.model,
      })
    const completionHash = commandDigest({
      jobId: input.jobId,
      requestId: input.requestId,
      content: parsedCompletion.content,
      citationNodeIds: parsedCompletion.citationNodeIds,
      outcome: 'deterministic_grounded',
      model: parsedCompletion.model,
    })

    return this.database.client.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          jobStatus: cortexAssistantGenerationJobs.status,
          jobClaimTokenHash: cortexAssistantGenerationJobs.claim_token_hash,
          requestId: cortexAssistantTurnRequests.id,
          requestState: cortexAssistantTurnRequests.state,
          requestClaimTokenHash: cortexAssistantTurnRequests.claim_token_hash,
          conversationId: cortexAssistantTurnRequests.conversation_id,
          userMessageId: cortexAssistantTurnRequests.user_message_id,
          tenantId: cortexAssistantTurnRequests.tenant_id,
          userId: cortexAssistantTurnRequests.user_id,
          role: users.role,
          email: users.email,
        })
        .from(cortexAssistantGenerationJobs)
        .innerJoin(
          cortexAssistantTurnRequests,
          and(
            eq(
              cortexAssistantTurnRequests.id,
              cortexAssistantGenerationJobs.request_id
            ),
            eq(
              cortexAssistantTurnRequests.tenant_id,
              cortexAssistantGenerationJobs.tenant_id
            )
          )
        )
        .innerJoin(
          users,
          and(
            eq(users.id, cortexAssistantGenerationJobs.user_id),
            eq(users.tenant_id, cortexAssistantGenerationJobs.tenant_id)
          )
        )
        .where(
          and(
            eq(cortexAssistantGenerationJobs.id, input.jobId),
            eq(cortexAssistantGenerationJobs.request_id, input.requestId)
          )
        )
        .limit(1)
        .for('update')
      if (!row || row.jobStatus !== 'processing') return false
      if (
        row.requestState !== 'processing' ||
        row.jobClaimTokenHash !== input.claimTokenHash ||
        row.requestClaimTokenHash !== input.claimTokenHash
      ) {
        return false
      }

      const authorizedPrincipal = await this.lockAuthorizedPrincipal(
        transaction,
        {
          tenantId: row.tenantId,
          userId: row.userId,
          role: row.role as ErpRole,
          email: row.email,
        }
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const conversation = await this.lockConversation(
        transaction,
        authorizedPrincipal,
        row.conversationId
      )
      await this.authorizeStoredContext(
        transaction,
        authorizedPrincipal,
        conversation
      )
      await this.lockOfficialUserTurn(
        transaction,
        authorizedPrincipal,
        row.conversationId,
        row.userMessageId
      )
      await this.authorizeCitations(
        transaction,
        authorizedPrincipal,
        parsedCompletion.citationNodeIds
      )

      const now = new Date()
      const [message] = await transaction
        .insert(cortexMessages)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          conversation_id: row.conversationId,
          role: 'assistant',
          content: parsedCompletion.content,
          citations: parsedCompletion.citationNodeIds.map((nodeId) => ({
            nodeId,
          })),
        })
        .returning({ id: cortexMessages.id })
      if (!message) {
        throw new InternalServerErrorException(
          'Cortex assistant turn was not stored'
        )
      }
      const [updatedConversation] = await transaction
        .update(cortexConversations)
        .set({ updated_at: now })
        .where(
          and(
            eq(cortexConversations.id, row.conversationId),
            eq(cortexConversations.tenant_id, authorizedPrincipal.tenantId),
            eq(cortexConversations.user_id, authorizedPrincipal.userId)
          )
        )
        .returning({ id: cortexConversations.id })
      if (!updatedConversation) {
        throw new InternalServerErrorException(
          'Cortex conversation timestamp was not updated'
        )
      }

      const result = cortexConversationAssistantTurnCompleteResultSchema.parse({
        status: 'created',
        conversationId: row.conversationId,
        userMessageId: row.userMessageId,
        messageId: message.id,
      })
      const [completedRequest] = await transaction
        .update(cortexAssistantTurnRequests)
        .set({
          state: 'succeeded',
          completion_hash: completionHash,
          claim_token_hash: null,
          lease_expires_at: null,
          assistant_message_id: message.id,
          outcome: 'deterministic_grounded',
          model: parsedCompletion.model,
          result,
          completed_at: now,
        })
        .where(
          and(
            eq(cortexAssistantTurnRequests.id, row.requestId),
            eq(cortexAssistantTurnRequests.state, 'processing'),
            eq(
              cortexAssistantTurnRequests.claim_token_hash,
              input.claimTokenHash
            )
          )
        )
        .returning({ id: cortexAssistantTurnRequests.id })
      if (!completedRequest) {
        throw new InternalServerErrorException(
          'Cortex assistant-turn request changed before completion'
        )
      }
      const [completedJob] = await transaction
        .update(cortexAssistantGenerationJobs)
        .set({
          status: 'succeeded',
          failure_code: null,
          completed_at: now,
          updated_at: now,
        })
        .where(
          and(
            eq(cortexAssistantGenerationJobs.id, input.jobId),
            eq(cortexAssistantGenerationJobs.status, 'processing'),
            eq(
              cortexAssistantGenerationJobs.claim_token_hash,
              input.claimTokenHash
            )
          )
        )
        .returning({ id: cortexAssistantGenerationJobs.id })
      if (!completedJob) {
        throw new InternalServerErrorException(
          'Cortex assistant generation job changed before completion'
        )
      }
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'cortex_conversation',
        entityId: row.conversationId,
        action: 'update',
        diff: {
          turn_role: 'assistant',
          user_message_id: row.userMessageId,
          message_id: message.id,
          assistant_generation_job_id: input.jobId,
          assistant_generation_job_state: 'succeeded',
          response_hash: sha256(parsedCompletion.content),
          response_char_count: parsedCompletion.content.length,
          citation_node_ids: parsedCompletion.citationNodeIds,
          citation_count: parsedCompletion.citationNodeIds.length,
          outcome: 'deterministic_grounded',
          model: parsedCompletion.model,
        },
      })
      return true
    })
  }

  private assertWriteEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cortex assistant-turn writes are not enabled for this tenant.'
      )
    }
  }

  private verifySignature(
    operation: 'claim' | 'complete' | 'start_job',
    command: object,
    principal: ErpPrincipal,
    idempotencyKey: string,
    headers: CortexAssistantTurnSignatureHeaders
  ): void {
    const secret = this.config.get<string>(
      'ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET'
    )
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'Cortex assistant-turn signing is not configured.'
      )
    }
    const timestamp = headers.timestamp?.trim() ?? ''
    const rawSignature = headers.signature?.trim() ?? ''
    if (!/^\d{10}$/.test(timestamp)) throw new UnauthorizedException()
    const timestampSeconds = Number(timestamp)
    const nowSeconds = Math.floor(Date.now() / 1_000)
    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) >
        CORTEX_ASSISTANT_TURN_SIGNATURE_MAX_AGE_SECONDS
    ) {
      throw new UnauthorizedException()
    }
    const match = new RegExp(
      `^${CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION}=([0-9a-f]{64})$`,
      'i'
    ).exec(rawSignature)
    if (!match?.[1]) throw new UnauthorizedException()

    const payload = cortexConversationAssistantTurnSignaturePayload({
      operation,
      timestamp,
      tenantId: principal.tenantId,
      userId: principal.userId,
      idempotencyKey,
      commandDigest: commandDigest(command),
    })
    const expected = createHmac('sha256', secret).update(payload).digest()
    const presented = Buffer.from(match[1], 'hex')
    if (
      presented.length !== expected.length ||
      !timingSafeEqual(presented, expected)
    ) {
      throw new UnauthorizedException()
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

  private async authorizeStoredContext(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    conversation: {
      contextRefTable: string | null
      contextRefId: string | null
    }
  ): Promise<AuthorizedContext | null> {
    const refTable = conversation.contextRefTable
    const refId = conversation.contextRefId
    if (!refTable && !refId) return null
    if (!refTable || !refId || !isCortexGraphRefTable(refTable)) {
      throw new NotFoundException('Conversation not found')
    }
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
          eq(cortexNodes.ref_table, refTable),
          eq(cortexNodes.ref_id, refId),
          isNull(cortexNodes.valid_to)
        )
      )
      .orderBy(desc(cortexNodes.recorded_at))
      .limit(1)
      .for('share')
    const scope = cortexSearchNodeTypeScope(principal.role)
    if (
      !node ||
      !cortexGraphRefTableMatchesType(refTable, node.nodeType) ||
      (scope !== null && !scope.includes(node.nodeType))
    ) {
      throw new NotFoundException('Conversation not found')
    }
    return { refTable, refId }
  }

  private async lockOfficialUserTurn(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    conversationId: string,
    userMessageId: string
  ): Promise<void> {
    const [turnRequest] = await transaction
      .select({ id: cortexConversationTurnRequests.id })
      .from(cortexConversationTurnRequests)
      .where(
        and(
          eq(cortexConversationTurnRequests.tenant_id, principal.tenantId),
          eq(cortexConversationTurnRequests.user_id, principal.userId),
          eq(cortexConversationTurnRequests.conversation_id, conversationId),
          eq(cortexConversationTurnRequests.message_id, userMessageId),
          eq(cortexConversationTurnRequests.state, 'succeeded')
        )
      )
      .limit(1)
      .for('update')
    const [message] = await transaction
      .select({ id: cortexMessages.id })
      .from(cortexMessages)
      .where(
        and(
          eq(cortexMessages.tenant_id, principal.tenantId),
          eq(cortexMessages.id, userMessageId),
          eq(cortexMessages.conversation_id, conversationId),
          eq(cortexMessages.role, 'user')
        )
      )
      .limit(1)
      .for('update')
    if (!turnRequest || !message) {
      throw new NotFoundException('Official Cortex user turn not found')
    }
  }

  private async claimOrReplay(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    command: CortexConversationAssistantTurnClaimCommand,
    idempotencyKey: string,
    requestHash: string,
    now: Date
  ): Promise<InternalClaimResult> {
    const claimToken = randomUUID()
    const leaseExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MS)
    const [inserted] = await transaction
      .insert(cortexAssistantTurnRequests)
      .values({
        tenant_id: principal.tenantId,
        user_id: principal.userId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        conversation_id: command.conversationId,
        user_message_id: command.userMessageId,
        claim_token_hash: sha256(claimToken),
        lease_expires_at: leaseExpiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: cortexAssistantTurnRequests.id })

    const [request] = await transaction
      .select({
        id: cortexAssistantTurnRequests.id,
        requestHash: cortexAssistantTurnRequests.request_hash,
        state: cortexAssistantTurnRequests.state,
        conversationId: cortexAssistantTurnRequests.conversation_id,
        userMessageId: cortexAssistantTurnRequests.user_message_id,
        leaseExpiresAt: cortexAssistantTurnRequests.lease_expires_at,
        assistantMessageId: cortexAssistantTurnRequests.assistant_message_id,
        outcome: cortexAssistantTurnRequests.outcome,
        model: cortexAssistantTurnRequests.model,
      })
      .from(cortexAssistantTurnRequests)
      .where(
        and(
          eq(cortexAssistantTurnRequests.tenant_id, principal.tenantId),
          eq(cortexAssistantTurnRequests.user_id, principal.userId),
          eq(cortexAssistantTurnRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      const [sameTurn] = await transaction
        .select({ id: cortexAssistantTurnRequests.id })
        .from(cortexAssistantTurnRequests)
        .where(
          and(
            eq(cortexAssistantTurnRequests.tenant_id, principal.tenantId),
            eq(
              cortexAssistantTurnRequests.user_message_id,
              command.userMessageId
            )
          )
        )
        .limit(1)
        .for('update')
      if (sameTurn) {
        throw new ConflictException(
          'Official Cortex user turn already has an assistant generation'
        )
      }
      throw new InternalServerErrorException(
        'Cortex assistant-turn request was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different assistant generation'
      )
    }
    if (request.state === 'succeeded') {
      return this.loadSucceededRequest(transaction, request, principal)
    }
    if (inserted) {
      return {
        status: 'claimed',
        conversationId: request.conversationId,
        userMessageId: request.userMessageId,
        requestId: request.id,
        claimToken,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
      }
    }
    if (
      request.leaseExpiresAt &&
      request.leaseExpiresAt.getTime() > now.getTime()
    ) {
      return {
        status: 'in_progress',
        conversationId: request.conversationId,
        userMessageId: request.userMessageId,
        retryAfterSeconds: Math.max(
          1,
          Math.min(
            300,
            Math.ceil(
              (request.leaseExpiresAt.getTime() - now.getTime()) / 1_000
            )
          )
        ),
      }
    }

    const [reclaimed] = await transaction
      .update(cortexAssistantTurnRequests)
      .set({
        claim_token_hash: sha256(claimToken),
        lease_expires_at: leaseExpiresAt,
      })
      .where(
        and(
          eq(cortexAssistantTurnRequests.id, request.id),
          eq(cortexAssistantTurnRequests.state, 'processing')
        )
      )
      .returning({ id: cortexAssistantTurnRequests.id })
    if (!reclaimed) {
      throw new ConflictException('Assistant generation could not be reclaimed')
    }
    return {
      status: 'claimed',
      conversationId: request.conversationId,
      userMessageId: request.userMessageId,
      requestId: request.id,
      claimToken,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
    }
  }

  private async loadSucceededRequest(
    transaction: DatabaseTransaction,
    request: {
      conversationId: string
      userMessageId: string
      assistantMessageId: string | null
      outcome: string | null
      model: string | null
    },
    principal: ErpPrincipal
  ): Promise<SucceededRequest> {
    if (!request.assistantMessageId || !request.outcome || !request.model) {
      throw new InternalServerErrorException(
        'Cortex assistant-turn result is incomplete'
      )
    }
    const [message] = await transaction
      .select({
        id: cortexMessages.id,
        content: cortexMessages.content,
        citations: cortexMessages.citations,
      })
      .from(cortexMessages)
      .where(
        and(
          eq(cortexMessages.tenant_id, principal.tenantId),
          eq(cortexMessages.id, request.assistantMessageId),
          eq(cortexMessages.conversation_id, request.conversationId),
          eq(cortexMessages.role, 'assistant')
        )
      )
      .limit(1)
    if (!message) {
      throw new InternalServerErrorException(
        'Cortex assistant-turn message is missing'
      )
    }
    return {
      status: 'succeeded',
      authorizedRole: principal.role,
      conversationId: request.conversationId,
      userMessageId: request.userMessageId,
      messageId: message.id,
      content: message.content,
      citationNodeIds: storedCitationIds(message.citations),
      outcome: request.outcome as CortexConversationAssistantTurnOutcome,
      model: request.model,
    }
  }

  private async lockRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    requestId: string,
    idempotencyKey: string
  ) {
    const [request] = await transaction
      .select({
        id: cortexAssistantTurnRequests.id,
        state: cortexAssistantTurnRequests.state,
        completionHash: cortexAssistantTurnRequests.completion_hash,
        claimTokenHash: cortexAssistantTurnRequests.claim_token_hash,
        leaseExpiresAt: cortexAssistantTurnRequests.lease_expires_at,
        conversationId: cortexAssistantTurnRequests.conversation_id,
        userMessageId: cortexAssistantTurnRequests.user_message_id,
        result: cortexAssistantTurnRequests.result,
      })
      .from(cortexAssistantTurnRequests)
      .where(
        and(
          eq(cortexAssistantTurnRequests.id, requestId),
          eq(cortexAssistantTurnRequests.tenant_id, principal.tenantId),
          eq(cortexAssistantTurnRequests.user_id, principal.userId),
          eq(cortexAssistantTurnRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new NotFoundException('Assistant generation not found')
    }
    return request
  }

  private async authorizeCitations(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    nodeIds: string[]
  ): Promise<void> {
    if (nodeIds.length === 0) return
    const nodes = await transaction
      .select({ id: cortexNodes.id, nodeType: cortexNodes.node_type })
      .from(cortexNodes)
      .where(
        and(
          eq(cortexNodes.tenant_id, principal.tenantId),
          inArray(cortexNodes.id, nodeIds),
          isNull(cortexNodes.valid_to)
        )
      )
      .for('share')
    const scope = cortexSearchNodeTypeScope(principal.role)
    const allowedIds = new Set(
      nodes
        .filter(
          (node) => scope === null || scope.includes(node.nodeType)
        )
        .map((node) => node.id)
    )
    if (nodeIds.some((nodeId) => !allowedIds.has(nodeId))) {
      throw new NotFoundException('Cortex citation not found')
    }
  }
}
