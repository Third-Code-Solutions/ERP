import { NextResponse, type NextRequest } from 'next/server'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  type UniversalSearchHit,
  type UniversalSearchResult,
} from '@third-code-erp/shared-types'
import {
  accounts,
  projects,
  opportunities,
  boms,
  purchaseOrders,
  invoices,
  progressClaims,
  documents,
  dailyTasks,
  permits,
  punchlistItems,
  warrantyTickets,
  deliverySchedules,
  rfqs,
  vendors,
  materialItems,
  ledgerAccounts,
  journalEntries,
} from '@third-code-erp/database/schema'
import {
  canSearchEntity,
  literalSearchPattern,
  normalizeSearchQuery,
  type SearchHitType,
} from './search-policy'
import { universalSearchResultFromSettled } from './search-result'
import {
  searchUniversalThroughCoreApi,
  universalSearchReadsUseCoreApi,
} from '@/lib/erp-core-client'

type SearchHit = UniversalSearchHit

interface SearchQuery {
  type: SearchHitType
  promise: Promise<SearchHit[]>
}

const PER_TYPE_LIMIT = 5
const SEARCH_RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
} as const

function searchResponse(
  body: UniversalSearchResult,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: SEARCH_RESPONSE_HEADERS,
  })
}

export async function GET(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return searchResponse({ hits: [], status: 'complete', failedTypes: [] }, 401)
  }

  // Bound wildcard-search work before fan-out across record types.
  const q = normalizeSearchQuery(req.nextUrl.searchParams.get('q'))
  if (q.length < 2) {
    return searchResponse({
      hits: [],
      status: 'complete',
      failedTypes: [],
      hint: 'Type at least 2 characters.',
    })
  }

  if (universalSearchReadsUseCoreApi(profile.tenantId)) {
    const result = await searchUniversalThroughCoreApi(q)
    if (!result.ok || !result.data) {
      return searchResponse(
        {
          hits: [],
          status: 'complete',
          failedTypes: [],
          hint: result.error ?? 'Universal search service is unavailable.',
        },
        result.status ?? 503
      )
    }
    return searchResponse(result.data)
  }

  const like = literalSearchPattern(q)
  const role = profile.role
  const tenantId = profile.tenantId

  // Build per-type promises so the search is parallel + role-filtered.
  const queries: SearchQuery[] = []
  const addQuery = (type: SearchHitType, promise: Promise<SearchHit[]>) => {
    queries.push({ type, promise })
  }

  if (canSearchEntity(role, 'account')) {
    addQuery('account',
      db
        .select({
          id: accounts.id,
          name: accounts.name,
          industry: accounts.industry,
        })
        .from(accounts)
        .where(and(eq(accounts.tenant_id, tenantId), ilike(accounts.name, like)))
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'account',
            id: r.id,
            title: r.name,
            subtitle: r.industry?.replace(/_/g, ' '),
            href: `/crm/accounts/${r.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'vendor')) {
    addQuery(
      'vendor',
      db
        .select({
          id: vendors.id,
          name: vendors.name,
          contact_name: vendors.contact_name,
          address: vendors.address,
        })
        .from(vendors)
        .where(
          and(
            eq(vendors.tenant_id, tenantId),
            or(
              ilike(vendors.name, like),
              ilike(vendors.contact_name, like),
              ilike(vendors.address, like)
            )
          )
        )
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((row) => ({
            type: 'vendor',
            id: row.id,
            title: row.name,
            subtitle: row.contact_name ?? row.address ?? undefined,
            href: '/purchase-orders',
          }))
        )
    )
  }

  if (canSearchEntity(role, 'material')) {
    addQuery(
      'material',
      db
        .select({
          id: materialItems.id,
          code: materialItems.code,
          description: materialItems.description,
          category: materialItems.category,
          unit: materialItems.unit,
        })
        .from(materialItems)
        .where(
          and(
            eq(materialItems.tenant_id, tenantId),
            or(
              ilike(materialItems.code, like),
              ilike(materialItems.description, like),
              ilike(materialItems.category, like)
            )
          )
        )
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((row) => ({
            type: 'material',
            id: row.id,
            title: row.code,
            subtitle: `${row.description} / ${row.unit}${row.category ? ` / ${row.category}` : ''}`,
            href: '/admin/material-items',
          }))
        )
    )
  }

  if (canSearchEntity(role, 'project')) {
    addQuery('project',
      db
        .select({
          id: projects.id,
          name: projects.name,
          client: projects.client,
          status: projects.status,
        })
        .from(projects)
        .where(
          and(
            eq(projects.tenant_id, tenantId),
            or(ilike(projects.name, like), ilike(projects.client, like))
          )
        )
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'project',
            id: r.id,
            title: r.name,
            subtitle: `${r.client} · ${r.status}`,
            href: `/projects/${r.id}`,
          }))
        )
    )

    addQuery('opportunity',
      db
        .select({
          id: opportunities.id,
          stage: opportunities.stage,
          tcv: opportunities.tcv_cents,
          opportunity_type: opportunities.opportunity_type,
          account_name: accounts.name,
        })
        .from(opportunities)
        .leftJoin(
          accounts,
          and(
            eq(accounts.id, opportunities.account_id),
            eq(accounts.tenant_id, tenantId)
          )
        )
        .where(
          and(
            eq(opportunities.tenant_id, tenantId),
            or(
              ilike(opportunities.opportunity_type, like),
              ilike(accounts.name, like)
            )
          )
        )
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'opportunity',
            id: r.id,
            title: r.opportunity_type || 'Opportunity',
            subtitle: `${r.account_name ?? '—'} · ${r.stage} · ₱${(r.tcv / 100).toLocaleString('en-PH')}`,
            href: `/pipeline/board`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'bom')) {
    addQuery('bom',
      db
        .select({
          id: boms.id,
          label: boms.label,
          version: boms.version,
          status: boms.status,
          project_id: boms.project_id,
          project_name: projects.name,
        })
        .from(boms)
        .leftJoin(
          projects,
          and(
            eq(projects.id, boms.project_id),
            eq(projects.tenant_id, tenantId)
          )
        )
        .where(
          and(
            eq(boms.tenant_id, tenantId),
            or(ilike(boms.label, like), ilike(projects.name, like))
          )
        )
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'bom',
            id: r.id,
            title: r.label ?? `BOM v${r.version}`,
            subtitle: `${r.project_name ?? '—'} · ${r.status}`,
            href: `/projects/${r.project_id}/bom`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'po')) {
    addQuery('po',
      db
        .select({
          id: purchaseOrders.id,
          po_number: purchaseOrders.po_number,
          status: purchaseOrders.status,
          total: purchaseOrders.total_cents,
        })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.tenant_id, tenantId),
            ilike(purchaseOrders.po_number, like)
          )
        )
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'po',
            id: r.id,
            title: r.po_number,
            subtitle: `${r.status} · ₱${(r.total / 100).toLocaleString('en-PH')}`,
            href: `/purchase-orders/${r.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'invoice')) {
    addQuery('invoice',
      db
        .select({
          id: invoices.id,
          invoice_number: invoices.invoice_number,
          status: invoices.status,
          total: invoices.net_amount_cents,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenant_id, tenantId),
            ilike(invoices.invoice_number, like)
          )
        )
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'invoice',
            id: r.id,
            title: r.invoice_number,
            subtitle: `${r.status} · ₱${(r.total / 100).toLocaleString('en-PH')}`,
            href: `/invoices/${r.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'claim')) {
    addQuery('claim',
      db
        .select({
          id: progressClaims.id,
          claim_number: progressClaims.claim_number,
          status: progressClaims.status,
          amount: progressClaims.amount_cents,
        })
        .from(progressClaims)
        .where(
          and(
            eq(progressClaims.tenant_id, tenantId),
            ilike(progressClaims.claim_number, like)
          )
        )
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'claim',
            id: r.id,
            title: r.claim_number,
            subtitle: `${r.status} · ₱${(r.amount / 100).toLocaleString('en-PH')}`,
            href: `/claims/${r.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'ledger_account')) {
    addQuery('ledger_account',
      db
        .select({
          id: ledgerAccounts.id,
          code: ledgerAccounts.code,
          name: ledgerAccounts.name,
          account_type: ledgerAccounts.account_type,
        })
        .from(ledgerAccounts)
        .where(
          and(
            eq(ledgerAccounts.tenant_id, tenantId),
            or(
              ilike(ledgerAccounts.code, like),
              ilike(ledgerAccounts.name, like)
            )
          )
        )
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((row) => ({
            type: 'ledger_account',
            id: row.id,
            title: `${row.code} · ${row.name}`,
            subtitle: row.account_type,
            href: `/finance/ledger?account=${row.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'journal_entry')) {
    addQuery('journal_entry',
      db
        .select({
          id: journalEntries.id,
          entry_number: journalEntries.entry_number,
          description: journalEntries.description,
          status: journalEntries.status,
          posting_date: journalEntries.posting_date,
        })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.tenant_id, tenantId),
            or(
              ilike(journalEntries.entry_number, like),
              ilike(journalEntries.description, like)
            )
          )
        )
        .orderBy(desc(journalEntries.posting_date))
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((row) => ({
            type: 'journal_entry',
            id: row.id,
            title: row.entry_number ?? 'Draft journal',
            subtitle: `${row.posting_date} · ${row.status} · ${row.description}`,
            href: `/finance/journals/${row.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'document')) {
    addQuery('document',
      db
        .select({
          id: documents.id,
          file_name: documents.file_name,
          document_type: documents.document_type,
          project_name: projects.name,
        })
        .from(documents)
        .innerJoin(
          projects,
          and(
            eq(projects.id, documents.project_id),
            eq(projects.tenant_id, tenantId)
          )
        )
        .where(
          and(
            eq(documents.tenant_id, tenantId),
            or(
              ilike(documents.file_name, like),
              ilike(documents.description, like),
              ilike(projects.name, like)
            )
          )
        )
        .orderBy(desc(documents.created_at))
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'document',
            id: r.id,
            title: r.file_name,
            subtitle: `${r.project_name} · ${r.document_type.replace(/_/g, ' ')}`,
            href: `/api/documents/${r.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'task')) {
    addQuery('task',
      db
        .select({
          id: dailyTasks.id,
          title: dailyTasks.title,
          status: dailyTasks.status,
          project_name: projects.name,
        })
        .from(dailyTasks)
        .innerJoin(
          projects,
          and(
            eq(projects.id, dailyTasks.project_id),
            eq(projects.tenant_id, tenantId)
          )
        )
        .where(
          and(
            eq(dailyTasks.tenant_id, tenantId),
            eq(dailyTasks.assignee_id, profile.user.id),
            or(
              ilike(dailyTasks.title, like),
              ilike(dailyTasks.description, like),
              ilike(projects.name, like)
            )
          )
        )
        .orderBy(desc(dailyTasks.due_date))
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'task',
            id: r.id,
            title: r.title,
            subtitle: `${r.project_name} · ${r.status.replace(/_/g, ' ')}`,
            href: r.status === 'done' ? '/tasks?tab=completed' : '/tasks',
          }))
        )
    )
  }

  if (canSearchEntity(role, 'permit')) {
    addQuery('permit',
      db
        .select({
          id: permits.id,
          project_id: permits.project_id,
          permit_type: permits.permit_type,
          status: permits.status,
          project_name: projects.name,
        })
        .from(permits)
        .innerJoin(
          projects,
          and(
            eq(projects.id, permits.project_id),
            eq(projects.tenant_id, tenantId)
          )
        )
        .where(
          and(
            eq(permits.tenant_id, tenantId),
            or(
              ilike(projects.name, like),
              ilike(permits.notes, like),
              sql`${permits.permit_type}::text ILIKE ${like}`,
              sql`${permits.status}::text ILIKE ${like}`
            )
          )
        )
        .orderBy(desc(permits.last_status_change_at))
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'permit',
            id: r.id,
            title: `${r.permit_type.replace(/_/g, ' ')} permit`,
            subtitle: `${r.project_name} · ${r.status.replace(/_/g, ' ')}`,
            href: `/projects/${r.project_id}/permits`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'punchlist')) {
    addQuery('punchlist',
      db
        .select({
          id: punchlistItems.id,
          description: punchlistItems.description,
          location: punchlistItems.location,
          status: punchlistItems.status,
          project_name: projects.name,
        })
        .from(punchlistItems)
        .innerJoin(
          projects,
          and(
            eq(projects.id, punchlistItems.project_id),
            eq(projects.tenant_id, tenantId)
          )
        )
        .where(
          and(
            eq(punchlistItems.tenant_id, tenantId),
            or(
              ilike(punchlistItems.description, like),
              ilike(punchlistItems.location, like),
              ilike(punchlistItems.trade, like),
              ilike(punchlistItems.assigned_to_text, like),
              ilike(projects.name, like)
            )
          )
        )
        .orderBy(desc(punchlistItems.created_at))
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'punchlist',
            id: r.id,
            title: r.description,
            subtitle: `${r.project_name}${r.location ? ` · ${r.location}` : ''} · ${r.status.replace(/_/g, ' ')}`,
            href: `/punchlist/${r.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'warranty')) {
    addQuery('warranty',
      db
        .select({
          id: warrantyTickets.id,
          ticket_number: warrantyTickets.ticket_number,
          category: warrantyTickets.category,
          status: warrantyTickets.status,
          project_name: projects.name,
          account_name: accounts.name,
        })
        .from(warrantyTickets)
        .innerJoin(
          projects,
          and(
            eq(projects.id, warrantyTickets.project_id),
            eq(projects.tenant_id, tenantId)
          )
        )
        .leftJoin(
          accounts,
          and(
            eq(accounts.id, warrantyTickets.account_id),
            eq(accounts.tenant_id, tenantId)
          )
        )
        .where(
          and(
            eq(warrantyTickets.tenant_id, tenantId),
            or(
              ilike(warrantyTickets.ticket_number, like),
              ilike(warrantyTickets.description, like),
              ilike(warrantyTickets.location, like),
              ilike(projects.name, like),
              ilike(accounts.name, like)
            )
          )
        )
        .orderBy(desc(warrantyTickets.created_at))
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'warranty',
            id: r.id,
            title: r.ticket_number,
            subtitle: `${r.project_name}${r.account_name ? ` · ${r.account_name}` : ''} · ${r.category.replace(/_/g, ' ')} · ${r.status.replace(/_/g, ' ')}`,
            href: `/warranty/${r.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'delivery')) {
    addQuery('delivery',
      db
        .select({
          id: deliverySchedules.id,
          status: deliverySchedules.status,
          site_address: deliverySchedules.site_address,
          po_number: purchaseOrders.po_number,
          vendor_name: vendors.name,
        })
        .from(deliverySchedules)
        .innerJoin(
          purchaseOrders,
          and(
            eq(purchaseOrders.id, deliverySchedules.purchase_order_id),
            eq(purchaseOrders.tenant_id, tenantId)
          )
        )
        .leftJoin(
          vendors,
          and(
            eq(vendors.id, purchaseOrders.vendor_id),
            eq(vendors.tenant_id, tenantId)
          )
        )
        .where(
          and(
            eq(deliverySchedules.tenant_id, tenantId),
            or(
              ilike(purchaseOrders.po_number, like),
              ilike(deliverySchedules.site_address, like),
              ilike(deliverySchedules.site_contact_name, like),
              ilike(vendors.name, like)
            )
          )
        )
        .orderBy(desc(deliverySchedules.created_at))
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'delivery',
            id: r.id,
            title: `Delivery · ${r.po_number}`,
            subtitle: `${r.vendor_name ?? 'Vendor not set'}${r.site_address ? ` · ${r.site_address}` : ''} · ${r.status.replace(/_/g, ' ')}`,
            href: `/procurement/deliveries/${r.id}`,
          }))
        )
    )
  }

  if (canSearchEntity(role, 'rfq')) {
    addQuery('rfq',
      db
        .select({
          id: rfqs.id,
          status: rfqs.status,
          bom_label: boms.label,
          bom_version: boms.version,
          project_name: projects.name,
        })
        .from(rfqs)
        .innerJoin(
          boms,
          and(eq(boms.id, rfqs.bom_id), eq(boms.tenant_id, tenantId))
        )
        .innerJoin(
          projects,
          and(eq(projects.id, boms.project_id), eq(projects.tenant_id, tenantId))
        )
        .where(
          and(
            eq(rfqs.tenant_id, tenantId),
            or(
              ilike(boms.label, like),
              ilike(projects.name, like),
              sql`${rfqs.id}::text ILIKE ${like}`
            )
          )
        )
        .orderBy(desc(rfqs.created_at))
        .limit(PER_TYPE_LIMIT)
        .then((rows) =>
          rows.map<SearchHit>((r) => ({
            type: 'rfq',
            id: r.id,
            title: r.bom_label ?? `BOM v${r.bom_version} RFQ`,
            subtitle: `${r.project_name} · ${r.status.replace(/_/g, ' ')}`,
            href: `/procurement/rfqs/${r.id}`,
          }))
        )
    )
  }

  const results = await Promise.allSettled(
    queries.map(({ promise }) => promise)
  )
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[universal-search] record query failed', result.reason)
    }
  }

  return searchResponse(universalSearchResultFromSettled(queries, results))
}
