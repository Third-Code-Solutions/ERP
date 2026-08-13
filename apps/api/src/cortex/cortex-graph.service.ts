import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  getCortexFocusedGraph,
  getCortexGraph,
  getCortexNodeByRef,
} from '@third-code-erp/database'
import {
  cortexGraphRefTableMatchesType,
  cortexFocusedGraphResultFromRows,
  cortexGraphResultFromRows,
  type CortexGraphQuery,
  type CortexGraphResponse,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

@Injectable()
export class CortexGraphService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async read(
    query: CortexGraphQuery,
    principal: ErpPrincipal
  ): Promise<CortexGraphResponse> {
    this.assertReadEnabled(principal)

    const scope = cortexSearchNodeTypeScope(principal.role)
    if (!query.refTable || !query.refId) {
      const graph = await getCortexGraph(principal.tenantId, 1500, scope)
      return cortexGraphResultFromRows(graph)
    }

    const node = await getCortexNodeByRef(
      principal.tenantId,
      query.refTable,
      query.refId
    )
    if (
      !node ||
      !cortexGraphRefTableMatchesType(query.refTable, node.node_type) ||
      (scope !== null && !scope.includes(node.node_type))
    ) {
      throw this.notFound()
    }

    const graph = await getCortexFocusedGraph(
      principal.tenantId,
      node.id,
      40,
      scope
    )
    const sanitized = cortexFocusedGraphResultFromRows(graph)
    if (!sanitized) throw this.notFound()

    return sanitized
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_CORTEX_GRAPH_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CORTEX_GRAPH_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cortex graph reads are not enabled for this tenant.'
      )
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException('Focused record not found.')
  }
}
