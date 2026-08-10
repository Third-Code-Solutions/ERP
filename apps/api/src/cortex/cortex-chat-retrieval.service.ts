import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cortexDescribeEntity,
  cortexKeywordAnswer,
  getCortexGraphStats,
  getCortexNodeByRef,
  searchCortexNodes,
  searchCortexNodesByTerms,
} from '@third-code-erp/database'
import {
  cortexChatRetrievalItemSchema,
  cortexChatRetrievalResultSchema,
  cortexGraphRefTableMatchesType,
  cortexSearchTerms,
  isCortexGraphRefTable,
  type CortexChatRetrievalQuery,
  type CortexChatRetrievalResult,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function projectId(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return null
  }

  const value = (attributes as Record<string, unknown>).project_id
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null
}

@Injectable()
export class CortexChatRetrievalService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async read(
    query: CortexChatRetrievalQuery,
    principal: ErpPrincipal
  ): Promise<CortexChatRetrievalResult> {
    this.assertReadEnabled(principal)

    const scope = cortexSearchNodeTypeScope(principal.role)
    const terms = cortexSearchTerms(query.query)
    const [stats, recent, matches, keywordAnswer, focused] = await Promise.all([
      getCortexGraphStats(principal.tenantId, scope),
      searchCortexNodes(principal.tenantId, {
        limit: query.recentLimit,
        nodeTypes: scope,
      }),
      searchCortexNodesByTerms(
        principal.tenantId,
        terms,
        query.matchLimit,
        scope
      ),
      cortexKeywordAnswer(principal.tenantId, query.query, scope),
      this.readFocused(query, principal, scope),
    ])

    return cortexChatRetrievalResultSchema.parse({
      generatedAt: new Date().toISOString(),
      stats,
      recent: recent.flatMap((node) => {
        const item = this.toItem(node)
        return item ? [item] : []
      }),
      matches: matches.flatMap((node) => {
        const item = this.toItem(node)
        return item ? [item] : []
      }),
      focused,
      keywordAnswer,
      // Embedding/provider retrieval stays outside this first Core contract.
      semanticStatus: 'not_migrated',
    })
  }

  private async readFocused(
    query: CortexChatRetrievalQuery,
    principal: ErpPrincipal,
    scope: string[] | null
  ) {
    if (!query.focus) return null

    const node = await getCortexNodeByRef(
      principal.tenantId,
      query.focus.refTable,
      query.focus.refId
    )
    if (
      !node ||
      !cortexGraphRefTableMatchesType(query.focus.refTable, node.node_type) ||
      (scope !== null && !scope.includes(node.node_type))
    ) {
      return { found: false, summary: '', citations: [] }
    }

    const answer = await cortexDescribeEntity(
      principal.tenantId,
      query.focus.refTable,
      query.focus.refId,
      scope
    )
    return {
      found: answer.found,
      summary: answer.summary,
      citations: answer.citations,
    }
  }

  private toItem(node: {
    id: string
    node_type: string
    title: string | null
    summary: string | null
    ref_table: string
    ref_id: string
    attributes: unknown
    freshness: 'fresh' | 'stale' | 'unknown'
    recorded_at: Date
  }): ReturnType<typeof cortexChatRetrievalItemSchema.parse> | null {
    if (
      !isCortexGraphRefTable(node.ref_table) ||
      !cortexGraphRefTableMatchesType(node.ref_table, node.node_type)
    ) {
      return null
    }

    const parsed = cortexChatRetrievalItemSchema.safeParse({
      id: node.id,
      nodeType: node.node_type,
      title: node.title?.trim() || null,
      summary: node.summary,
      refTable: node.ref_table,
      refId: node.ref_id,
      projectId: projectId(node.attributes),
      freshness: node.freshness,
      recordedAt: node.recorded_at.toISOString(),
      source: 'cortex' as const,
    })
    return parsed.success ? parsed.data : null
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cortex chat retrieval reads are not enabled for this tenant.'
      )
    }
  }
}
