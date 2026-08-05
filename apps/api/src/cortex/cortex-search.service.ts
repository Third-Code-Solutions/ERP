import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { searchCortexNodesByTerms } from '@third-code-erp/database'
import {
  cortexSearchResultSchema,
  cortexSearchTerms,
  type CortexSearchQuery,
  type CortexSearchResult,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

function projectId(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return null
  }

  const value = (attributes as Record<string, unknown>).project_id
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Injectable()
export class CortexSearchService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async search(
    query: CortexSearchQuery,
    principal: ErpPrincipal
  ): Promise<CortexSearchResult> {
    this.assertReadEnabled(principal)

    const terms = cortexSearchTerms(query.q)
    if (terms.length === 0) return { hits: [] }

    const nodes = await searchCortexNodesByTerms(
      principal.tenantId,
      terms,
      query.limit,
      cortexSearchNodeTypeScope(principal.role)
    )

    return cortexSearchResultSchema.parse({
      hits: nodes.map((node) => ({
        id: node.id,
        nodeType: node.node_type,
        title: node.title?.trim() || null,
        summary: node.summary?.trim() || null,
        refTable: node.ref_table,
        refId: node.ref_id,
        projectId: projectId(node.attributes),
        freshness: node.freshness,
        source: 'cortex' as const,
      })),
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_CORTEX_SEARCH_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CORTEX_SEARCH_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cortex search is not enabled for this tenant.'
      )
    }
  }
}
