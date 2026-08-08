import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { getCortexOperationalBrief } from '@third-code-erp/database'
import {
  cortexBriefResultSchema,
  type CortexBriefQuery,
  type CortexBriefResult,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

@Injectable()
export class CortexBriefService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async read(
    query: CortexBriefQuery,
    principal: ErpPrincipal
  ): Promise<CortexBriefResult> {
    this.assertReadEnabled(principal)

    const brief = await getCortexOperationalBrief(
      principal.tenantId,
      cortexSearchNodeTypeScope(principal.role),
      query.limit
    )

    return cortexBriefResultSchema.parse({
      generatedAt: brief.generatedAt.toISOString(),
      stats: brief.stats,
      freshness: brief.freshness,
      items: brief.items.map((item) => ({
        id: item.nodeId,
        nodeType: item.nodeType,
        title: item.title,
        summary: item.summary,
        refTable: item.refTable,
        refId: item.refId,
        projectId: item.projectId,
        freshness: item.freshness,
        recordedAt: item.recordedAt.toISOString(),
        source: 'cortex' as const,
      })),
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_CORTEX_BRIEF_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CORTEX_BRIEF_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cortex brief reads are not enabled for this tenant.'
      )
    }
  }
}
