import { NextResponse, type NextRequest } from 'next/server'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { getUserProfile } from '@buildops/auth'
import { db } from '@buildops/database'
import {
  accounts,
  projects,
  opportunities,
  boms,
  purchaseOrders,
  invoices,
  progressClaims,
} from '@buildops/database/schema'
import { canonicalRole } from '@/lib/abi/nav-config'

interface SearchHit {
  type: 'account' | 'project' | 'opportunity' | 'bom' | 'po' | 'invoice' | 'claim'
  id: string
  title: string
  subtitle?: string
  href: string
}

const PER_TYPE_LIMIT = 5

export async function GET(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json({ hits: [] }, { status: 401 })
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return NextResponse.json({ hits: [], hint: 'Type at least 2 characters.' })
  }

  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
  const role = canonicalRole(profile.role)
  const tenantId = profile.tenantId

  // Build per-type promises so the search is parallel + role-filtered.
  const queries: Array<Promise<SearchHit[]>> = []

  if (['admin', 'sales', 'commercial', 'sd_pm_pe', 'finance', 'cx'].includes(role)) {
    queries.push(
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

  if (
    ['admin', 'sales', 'commercial', 'design', 'sd_pm_pe', 'finance', 'procurement'].includes(role)
  ) {
    queries.push(
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

    queries.push(
      db
        .select({
          id: opportunities.id,
          stage: opportunities.stage,
          tcv: opportunities.tcv_cents,
          opportunity_type: opportunities.opportunity_type,
          account_name: accounts.name,
        })
        .from(opportunities)
        .leftJoin(accounts, eq(accounts.id, opportunities.account_id))
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

  if (['admin', 'commercial'].includes(role)) {
    queries.push(
      db
        .select({
          id: boms.id,
          label: boms.label,
          version: boms.version,
          status: boms.status,
          project_name: projects.name,
        })
        .from(boms)
        .leftJoin(projects, eq(projects.id, boms.project_id))
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
            href: `/projects/${r.id ? '' : ''}/bom`, // resolved below
          }))
        )
    )
  }

  if (['admin', 'commercial', 'sd_pm_pe', 'procurement'].includes(role)) {
    queries.push(
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

  if (['admin', 'finance'].includes(role)) {
    queries.push(
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

  if (['admin', 'finance', 'sd_pm_pe', 'commercial'].includes(role)) {
    queries.push(
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

  const results = await Promise.allSettled(queries)
  const hits = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

  return NextResponse.json({ hits })
}
