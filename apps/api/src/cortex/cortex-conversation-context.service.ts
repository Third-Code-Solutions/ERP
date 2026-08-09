import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  getCortexConversation,
  getCortexNodeByRef,
} from '@third-code-erp/database'
import {
  cortexConversationContextRefSchema,
  cortexConversationContextResolveQuerySchema,
  cortexConversationContextResolveResponseSchema,
  cortexGraphRefTableMatchesType,
  isCortexGraphRefTable,
  type CortexConversationContextRef,
  type CortexConversationContextResolveQuery,
  type CortexConversationContextResolveResponse,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

@Injectable()
export class CortexConversationContextService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  /**
   * Resolve only authenticated ownership and immutable focused-record context.
   * Messages, retrieval, model calls, and writes intentionally remain outside
   * this authority boundary.
   */
  async resolve(
    query: CortexConversationContextResolveQuery,
    principal: ErpPrincipal
  ): Promise<CortexConversationContextResolveResponse> {
    const parsed = cortexConversationContextResolveQuerySchema.parse(query)
    this.assertReadEnabled(principal)

    if (parsed.conversationId) {
      const conversation = await getCortexConversation(
        principal.tenantId,
        principal.userId,
        parsed.conversationId
      )
      if (!conversation) throw this.notFound('Conversation not found')

      const storedContext = this.storedContext(conversation)
      if (
        parsed.context &&
        (!storedContext || !sameContext(parsed.context, storedContext))
      ) {
        throw new ConflictException('Conversation context mismatch')
      }

      const context = storedContext
        ? await this.authorizeContext(storedContext, principal, true)
        : null
      return cortexConversationContextResolveResponseSchema.parse({
        conversationId: conversation.id,
        context,
      })
    }

    const context = parsed.context
      ? await this.authorizeContext(parsed.context, principal, false)
      : null
    return cortexConversationContextResolveResponseSchema.parse({
      conversationId: null,
      context,
    })
  }

  private storedContext(conversation: {
    context_ref_table: string | null
    context_ref_id: string | null
  }): CortexConversationContextRef | null {
    if (!conversation.context_ref_table && !conversation.context_ref_id) {
      return null
    }
    if (!conversation.context_ref_table || !conversation.context_ref_id) {
      throw this.notFound('Conversation not found')
    }
    const parsed = cortexConversationContextRefSchema.safeParse({
      refTable: conversation.context_ref_table,
      refId: conversation.context_ref_id,
    })
    if (!parsed.success) throw this.notFound('Conversation not found')
    return parsed.data
  }

  private async authorizeContext(
    context: CortexConversationContextRef,
    principal: ErpPrincipal,
    hideAsConversation: boolean
  ) {
    const node = await getCortexNodeByRef(
      principal.tenantId,
      context.refTable,
      context.refId
    )
    const scope = cortexSearchNodeTypeScope(principal.role)
    if (
      !node ||
      !isCortexGraphRefTable(context.refTable) ||
      !cortexGraphRefTableMatchesType(context.refTable, node.node_type) ||
      (scope !== null && !scope.includes(node.node_type))
    ) {
      throw this.notFound(
        hideAsConversation ? 'Conversation not found' : 'Focused record not found'
      )
    }

    return {
      refTable: context.refTable,
      refId: context.refId,
      nodeId: node.id,
      nodeType: node.node_type,
      title: node.title,
    }
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cortex conversation context reads are not enabled for this tenant.'
      )
    }
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException(message)
  }
}

function sameContext(
  left: CortexConversationContextRef,
  right: CortexConversationContextRef
): boolean {
  return left.refTable === right.refTable && left.refId === right.refId
}
