import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  searchCortexNodesByTerms,
  type CortexNode,
} from '@third-code-erp/database'
import {
  canUniversalSearchEntity,
  universalSearchHitSchema,
  universalSearchResultSchema,
  type UniversalSearchHit,
  type UniversalSearchHitType,
  type UniversalSearchQuery,
  type UniversalSearchResult,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { cortexSearchNodeTypeScope } from '../cortex/cortex-search-scope'

type UniversalSource = {
  type: UniversalSearchHitType
  nodeType: string
  refTable: string
}

/** Only source-of-truth rows already mirrored into the reviewed graph map. */
const SOURCES: readonly UniversalSource[] = [
  { type: 'account', nodeType: 'account', refTable: 'accounts' },
  { type: 'project', nodeType: 'project', refTable: 'projects' },
  { type: 'opportunity', nodeType: 'opportunity', refTable: 'opportunities' },
  { type: 'bom', nodeType: 'bom', refTable: 'boms' },
  { type: 'po', nodeType: 'purchase_order', refTable: 'purchase_orders' },
  { type: 'invoice', nodeType: 'invoice', refTable: 'invoices' },
  { type: 'claim', nodeType: 'claim', refTable: 'progress_claims' },
  { type: 'document', nodeType: 'document', refTable: 'documents' },
  // My Tasks is assignee-scoped; pre-con checklist nodes are not included.
  { type: 'task', nodeType: 'task', refTable: 'daily_tasks' },
  { type: 'permit', nodeType: 'permit', refTable: 'permits' },
  { type: 'punchlist', nodeType: 'punchlist', refTable: 'punchlist_items' },
  { type: 'warranty', nodeType: 'ticket', refTable: 'warranty_tickets' },
  { type: 'delivery', nodeType: 'delivery', refTable: 'delivery_schedules' },
  { type: 'rfq', nodeType: 'rfq', refTable: 'rfqs' },
  { type: 'ledger_account', nodeType: 'ledger_account', refTable: 'ledger_accounts' },
  { type: 'journal_entry', nodeType: 'journal_entry', refTable: 'journal_entries' },
]

const SOURCE_BY_KEY = new Map(
  SOURCES.map((source) => [`${source.nodeType}:${source.refTable}`, source])
)

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const LABEL_BY_TYPE: Record<UniversalSearchHitType, string> = {
  account: 'Account',
  project: 'Project',
  opportunity: 'Opportunity',
  bom: 'BOM',
  po: 'Purchase order',
  invoice: 'Invoice',
  claim: 'Progress claim',
  document: 'Document',
  task: 'Task',
  permit: 'Permit',
  punchlist: 'Punchlist item',
  warranty: 'Warranty ticket',
  delivery: 'Delivery',
  rfq: 'RFQ',
  ledger_account: 'Ledger account',
  journal_entry: 'Journal entry',
}

function attributeString(node: CortexNode, key: string): string | null {
  if (
    typeof node.attributes !== 'object' ||
    node.attributes === null ||
    Array.isArray(node.attributes)
  ) {
    return null
  }
  const value = (node.attributes as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function attributeUuid(node: CortexNode, key: string): string | null {
  const value = attributeString(node, key)
  return value && UUID_PATTERN.test(value) ? value : null
}

function hrefFor(type: UniversalSearchHitType, node: CortexNode): string {
  switch (type) {
    case 'account':
      return `/crm/accounts/${node.ref_id}`
    case 'project':
      return `/projects/${node.ref_id}`
    case 'opportunity':
      return '/pipeline/board'
    case 'bom':
      return `/projects/${attributeUuid(node, 'project_id') ?? node.ref_id}/bom`
    case 'po':
      return `/purchase-orders/${node.ref_id}`
    case 'invoice':
      return `/invoices/${node.ref_id}`
    case 'claim':
      return `/claims/${node.ref_id}`
    case 'document':
      return `/api/documents/${node.ref_id}`
    case 'task':
      return attributeString(node, 'status') === 'done'
        ? '/tasks?tab=completed'
        : '/tasks'
    case 'permit':
      return `/projects/${attributeUuid(node, 'project_id') ?? node.ref_id}/permits`
    case 'punchlist':
      return `/punchlist/${node.ref_id}`
    case 'warranty':
      return `/warranty/${node.ref_id}`
    case 'delivery':
      return `/procurement/deliveries/${node.ref_id}`
    case 'rfq':
      return `/procurement/rfqs/${node.ref_id}`
    case 'ledger_account':
      return `/finance/ledger?account=${node.ref_id}`
    case 'journal_entry':
      return `/finance/journals/${node.ref_id}`
  }
}

function toHit(node: CortexNode, principal: ErpPrincipal): UniversalSearchHit | null {
  const source = SOURCE_BY_KEY.get(`${node.node_type}:${node.ref_table}`)
  if (!source || !canUniversalSearchEntity(principal.role, source.type)) {
    return null
  }

  // The Web compatibility route restricts tasks to the current assignee. The
  // graph stores that FK as a redacted-safe attribute; fail closed if absent.
  if (
    source.type === 'task' &&
    attributeString(node, 'assignee_id') !== principal.userId
  ) {
    return null
  }

  const title = (node.title?.trim() || LABEL_BY_TYPE[source.type]).slice(0, 500)
  const summary = node.summary?.trim().slice(0, 500)
  const parsed = universalSearchHitSchema.safeParse({
    type: source.type,
    id: node.ref_id,
    title,
    subtitle: summary || undefined,
    href: hrefFor(source.type, node),
  })
  return parsed.success ? parsed.data : null
}

@Injectable()
export class UniversalSearchService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async search(
    query: UniversalSearchQuery,
    principal: ErpPrincipal
  ): Promise<UniversalSearchResult> {
    this.assertReadEnabled(principal)

    const terms = query.q
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 3)
      .slice(0, 8)
    if (terms.length === 0) {
      return { hits: [], status: 'complete', failedTypes: [] }
    }

    // Read the derived graph only after tenant + role checks. Oversample to
    // preserve assignee-scoped task results without widening the response.
    const nodes = await searchCortexNodesByTerms(
      principal.tenantId,
      terms,
      Math.min(query.limit * 4, 80),
      cortexSearchNodeTypeScope(principal.role)
    )
    const hits = nodes
      .map((node) => toHit(node, principal))
      .filter((hit): hit is UniversalSearchHit => hit !== null)
      .slice(0, query.limit)

    return universalSearchResultSchema.parse({
      hits,
      status: 'complete',
      failedTypes: [],
      hint: 'Core search reads graph-indexed records; unselected tenants keep the compatibility route.',
    })
  }

  private assertReadEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_UNIVERSAL_SEARCH_READS_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_UNIVERSAL_SEARCH_READS_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Universal search is not enabled for this tenant.'
      )
    }
  }
}
