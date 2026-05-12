import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, desc } from 'drizzle-orm'
import { requireUserProfile } from '@buildops/auth'
import { db } from '@buildops/database'
import {
  opportunities,
  accounts,
  pprfSubmissions,
} from '@buildops/database/schema'
import { ProposalSubNav } from '@/components/proposal/sub-nav'
import { PprfForm } from '@/components/proposal/pprf-form'
import { pprfPayloadSchema } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/schemas'

interface PageProps {
  params: Promise<{ id: string }>
}

const EMPTY_DEFAULTS: {
  site_address: string
  floor_area_sqm: string
  landlord_contact: string
  as_built_available: 'yes' | 'no' | 'partial'
  scope_notes: string
  project_type: string
  expected_start_date: string
  budget_range: string
} = {
  site_address: '',
  floor_area_sqm: '',
  landlord_contact: '',
  as_built_available: 'no',
  scope_notes: '',
  project_type: '',
  expected_start_date: '',
  budget_range: '',
}

export default async function PprfPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [opp] = await db
    .select({
      id: opportunities.id,
      account_id: opportunities.account_id,
      account_name: accounts.name,
    })
    .from(opportunities)
    .leftJoin(accounts, eq(opportunities.account_id, accounts.id))
    .where(and(eq(opportunities.id, id), eq(opportunities.tenant_id, profile.tenantId)))
    .limit(1)
  if (!opp) notFound()

  const history = await db
    .select({
      id: pprfSubmissions.id,
      version: pprfSubmissions.version,
      submitted_at: pprfSubmissions.submitted_at,
      payload: pprfSubmissions.payload,
    })
    .from(pprfSubmissions)
    .where(eq(pprfSubmissions.opportunity_id, id))
    .orderBy(desc(pprfSubmissions.version))

  const latest = history[0]
  // Parse latest payload into the typed form defaults. If parse fails (e.g.
  // an older row without scope_notes), fall back to the empty template.
  let defaults = EMPTY_DEFAULTS
  if (latest) {
    const parsed = pprfPayloadSchema.safeParse(latest.payload)
    if (parsed.success) {
      defaults = {
        site_address: parsed.data.site_address,
        floor_area_sqm: String(parsed.data.floor_area_sqm),
        landlord_contact: parsed.data.landlord_contact,
        as_built_available: parsed.data.as_built_available,
        scope_notes: parsed.data.scope_notes ?? '',
        project_type: parsed.data.project_type ?? '',
        expected_start_date: parsed.data.expected_start_date ?? '',
        budget_range: parsed.data.budget_range ?? '',
      }
    }
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href={`/crm/opportunities/${id}/proposal`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {opp.account_name ?? 'Opportunity'} · Proposal
          </Link>
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">Project Pre-Requirements Form</h1>
            <p className="page-subtitle">
              Submitting a new form creates a new versioned row. Commercial and Finance get notified.
            </p>
          </div>
        </div>
      </div>

      <ProposalSubNav opportunityId={id} />

      <div className="section-grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {latest ? `Edit & resubmit (next: v${latest.version + 1})` : 'Submit PPRF v1'}
            </h2>
          </div>
          <div style={{ padding: 16 }}>
            <PprfForm opportunityId={id} defaults={defaults} />
          </div>
        </div>

        <aside>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Version history ({history.length})</h2>
            </div>
            {history.length === 0 ? (
              <div className="card-empty">No PPRF submitted yet.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>v{h.version}</td>
                      <td className="muted">
                        {h.submitted_at
                          ? new Date(h.submitted_at).toLocaleString('en-PH', {
                              year: 'numeric', month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
