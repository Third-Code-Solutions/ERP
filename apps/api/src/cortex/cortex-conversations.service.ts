import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  getCortexCitationsByNodeIds,
  getCortexConversation,
  getCortexConversationMessages,
  getCortexNodeByRef,
  listCortexConversations,
  type CortexConversationSummary as StoredCortexConversation,
} from '@third-code-erp/database'
import {
  cortexConversationDetailResponseSchema,
  cortexConversationListResponseSchema,
  cortexGraphRefTableMatchesType,
  isCortexGraphRefTable,
  type CortexConversationContext,
  type CortexConversationDetailResponse,
  type CortexConversationListResponse,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { cortexConversationTimestamp } from './cortex-conversations.pipe'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

interface StoredCitation {
  nodeId: string
}

function storedCitationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !('nodeId' in candidate) ||
      typeof (candidate as StoredCitation).nodeId !== 'string'
    ) {
      return []
    }
    const nodeId = (candidate as StoredCitation).nodeId
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      nodeId
    )
      ? [nodeId]
      : []
  })
}

@Injectable()
export class CortexConversationsService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async list(
    principal: ErpPrincipal
  ): Promise<CortexConversationListResponse> {
    this.assertReadEnabled(principal)
    const stored = await listCortexConversations(
      principal.tenantId,
      principal.userId,
      30
    )

    const conversations = (
      await Promise.all(
        stored.map(async (conversation) => {
          const context = await this.authorizeContext(conversation, principal)
          if (
            (conversation.context_ref_table || conversation.context_ref_id) &&
            !context
          ) {
            return null
          }
          return {
            id: conversation.id,
            title: conversation.title,
            created_at: cortexConversationTimestamp(conversation.created_at),
            updated_at: cortexConversationTimestamp(conversation.updated_at),
            context,
          }
        })
      )
    ).filter((conversation) => conversation !== null)

    return cortexConversationListResponseSchema.parse({ conversations })
  }

  async read(
    conversationId: string,
    principal: ErpPrincipal
  ): Promise<CortexConversationDetailResponse> {
    this.assertReadEnabled(principal)
    const conversation = await getCortexConversation(
      principal.tenantId,
      principal.userId,
      conversationId
    )
    if (!conversation) throw this.notFound()

    const context = await this.authorizeContext(conversation, principal)
    if (
      (conversation.context_ref_table || conversation.context_ref_id) &&
      !context
    ) {
      throw this.notFound()
    }

    const messages = await getCortexConversationMessages(
      principal.tenantId,
      principal.userId,
      conversationId
    )
    if (!messages) throw this.notFound()

    const nodeIds = [
      ...new Set(
        messages.flatMap((message) => storedCitationIds(message.citations))
      ),
    ].slice(0, 200)
    const visibleCitations = await getCortexCitationsByNodeIds(
      principal.tenantId,
      nodeIds,
      cortexSearchNodeTypeScope(principal.role)
    )
    const visibleById = new Map(
      visibleCitations.map((citation) => [citation.nodeId, citation])
    )

    return cortexConversationDetailResponseSchema.parse({
      context,
      messages: messages.map(({ citations, ...message }) => ({
        ...message,
        created_at: cortexConversationTimestamp(message.created_at),
        citations: storedCitationIds(citations).flatMap((nodeId) => {
          const citation = visibleById.get(nodeId)
          return citation ? [citation] : []
        }),
      })),
    })
  }

  private async authorizeContext(
    conversation: Pick<
      StoredCortexConversation,
      'context_ref_table' | 'context_ref_id'
    >,
    principal: ErpPrincipal
  ): Promise<CortexConversationContext | null> {
    const refTable = conversation.context_ref_table
    const refId = conversation.context_ref_id
    if (!refTable && !refId) return null
    if (!refTable || !refId || !isCortexGraphRefTable(refTable)) return null

    const node = await getCortexNodeByRef(
      principal.tenantId,
      refTable,
      refId
    )
    const scope = cortexSearchNodeTypeScope(principal.role)
    if (
      !node ||
      !cortexGraphRefTableMatchesType(refTable, node.node_type) ||
      (scope !== null && !scope.includes(node.node_type))
    ) {
      return null
    }

    return {
      refTable,
      refId,
      nodeId: node.id,
      nodeType: node.node_type,
      title: node.title,
    }
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_CORTEX_CONVERSATION_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CORTEX_CONVERSATION_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cortex conversation reads are not enabled for this tenant.'
      )
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException('Cortex conversation not found.')
  }
}
