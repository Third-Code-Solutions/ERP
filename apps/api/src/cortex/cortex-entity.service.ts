import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  describeContextPack,
  getCortexContextPack,
  getCortexNodeByRef,
} from '@third-code-erp/database'
import {
  cortexEntityResponseFromSources,
  cortexGraphRefTableMatchesType,
  type CortexEntityFoundResponse,
  type CortexEntityParams,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

@Injectable()
export class CortexEntityService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async read(
    params: CortexEntityParams,
    principal: ErpPrincipal
  ): Promise<CortexEntityFoundResponse> {
    this.assertReadEnabled(principal)

    const scope = cortexSearchNodeTypeScope(principal.role)
    const node = await getCortexNodeByRef(
      principal.tenantId,
      params.refTable,
      params.refId
    )
    if (
      !node ||
      !cortexGraphRefTableMatchesType(params.refTable, node.node_type) ||
      (scope !== null && !scope.includes(node.node_type))
    ) {
      throw this.notFound()
    }

    const pack = await getCortexContextPack(
      principal.tenantId,
      params.refTable,
      params.refId,
      {
        neighborLimit: 12,
        provenanceLimit: 6,
        nodeTypes: scope,
      }
    )
    if (!pack) throw this.notFound()

    return cortexEntityResponseFromSources({
      summary: describeContextPack(pack),
      citations: pack.citations,
      relationships: pack.neighbors.map((neighbor) => ({
        edgeId: neighbor.edgeId,
        edgeType: neighbor.edgeType,
        direction: neighbor.direction,
        origin: neighbor.origin,
        confidence: neighbor.confidence,
        nodeId: neighbor.node.id,
      })),
      evidence: pack.provenance.map((provenance) => ({
        origin: provenance.origin,
        createdAt: provenance.created_at,
      })),
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_CORTEX_ENTITY_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CORTEX_ENTITY_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cortex entity reads are not enabled for this tenant.'
      )
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException('Cortex entity not found.')
  }
}
