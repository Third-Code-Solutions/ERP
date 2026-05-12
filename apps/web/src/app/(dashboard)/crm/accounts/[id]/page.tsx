import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, desc } from 'drizzle-orm'
import { requireUserProfile, can } from '@buildops/auth'
import { db } from '@buildops/database'
import {
  accounts,
  contacts,
  accountKycArtifacts,
  opportunities,
  projects,
  documents,
} from '@buildops/database/schema'
import { KycReviewForm } from '@/components/accounts/kyc-review-form'
import { AddKycArtifactForm } from '@/components/accounts/add-kyc-artifact-form'

interface PageProps {
  params: Promise<{ id: string }>
}

const KYC_BADGE: Record<string, string> = {
  pending: 'stage-badge stage-resubmission',
  approved: 'stage-badge stage-closed_won',
  flagged: 'stage-badge stage-negotiation',
  rejected: 'stage-badge stage-closed_lost',
  not_required: 'stage-badge stage-opportunity_creation',
}

const ARTIFACT_LABEL: Record<string, string> = {
  afs_year_1: 'AFS — Year 1',
  afs_year_2: 'AFS — Year 2',
  afs_year_3: 'AFS — Year 3',
  bir_2303: 'BIR 2303',
  vat_certificate: 'VAT certificate',
  top_suppliers: 'Top 10 suppliers',
  top_clients: 'Top 10 clients',
  other: 'Other',
}

export default async function AccountDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.tenant_id, profile.tenantId)))
    .limit(1)

  if (!account) notFound()

  const [contactRows, kycRows, oppRows, projectRows] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(eq(contacts.account_id, id))
      .orderBy(desc(contacts.is_primary), contacts.full_name),
    db
      .select({
        id: accountKycArtifacts.id,
        artifact_type: accountKycArtifacts.artifact_type,
        notes: accountKycArtifacts.notes,
        uploaded_at: accountKycArtifacts.uploaded_at,
        document_id: accountKycArtifacts.document_id,
        file_name: documents.file_name,
      })
      .from(accountKycArtifacts)
      .leftJoin(documents, eq(documents.id, accountKycArtifacts.document_id))
      .where(eq(accountKycArtifacts.account_id, id))
      .orderBy(desc(accountKycArtifacts.uploaded_at)),
    db
      .select({ id: opportunities.id, stage: opportunities.stage, tcv_cents: opportunities.tcv_cents })
      .from(opportunities)
      .where(eq(opportunities.account_id, id))
      .orderBy(desc(opportunities.created_at)),
    db
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.account_id, id))
      .orderBy(desc(projects.created_at)),
  ])

  const isFinance = can(profile.role, 'account.kyc_review')

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/crm/accounts" style={{ color: 'inherit', textDecoration: 'none' }}>CRM · Accounts</Link>
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">{account.name}</h1>
            <p className="page-subtitle">
              {account.industry.replace(/_/g, ' ')} ·{' '}
              <span className={KYC_BADGE[account.kyc_status] ?? 'stage-badge'}>
                <span className="stage-badge-dot" /> KYC: {account.kyc_status}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="section-grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* KYC Artifacts */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">KYC artifacts ({kycRows.length})</h2>
            </div>
            {kycRows.length === 0 ? (
              <div className="card-empty">No artifacts uploaded yet.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>File</th>
                    <th>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {kycRows.map((r) => (
                    <tr key={r.id}>
                      <td>{ARTIFACT_LABEL[r.artifact_type] ?? r.artifact_type}</td>
                      <td className="muted">{r.file_name ?? '—'}</td>
                      <td className="muted">
                        {new Date(r.uploaded_at).toLocaleDateString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: 16, borderTop: '1px solid var(--color-border)' }}>
              <AddKycArtifactForm accountId={id} />
            </div>
          </div>

          {/* Opportunities */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Opportunities ({oppRows.length})</h2>
            </div>
            {oppRows.length === 0 ? (
              <div className="card-empty">No opportunities on this account yet.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th className="numeric">TCV</th>
                  </tr>
                </thead>
                <tbody>
                  {oppRows.map((o) => (
                    <tr key={o.id}>
                      <td>{o.stage.replace(/_/g, ' ')}</td>
                      <td className="numeric currency">
                        ₱{(o.tcv_cents / 100).toLocaleString('en-PH')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Projects */}
          {projectRows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Projects ({projectRows.length})</h2>
              </div>
              <table className="data-table">
                <tbody>
                  {projectRows.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/projects/${p.id}`} style={{ color: 'inherit' }}>{p.name}</Link>
                      </td>
                      <td className="muted">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* KYC Review */}
          {isFinance && account.kyc_status === 'pending' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">KYC review</h2>
              </div>
              <div style={{ padding: 16 }}>
                <KycReviewForm accountId={id} />
              </div>
            </div>
          )}

          {/* Account meta */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Details</h2>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <Meta label="Industry" value={account.industry.replace(/_/g, ' ')} />
              <Meta label="Primary email" value={account.primary_email ?? '—'} />
              <Meta label="Primary phone" value={account.primary_phone ?? '—'} />
              {account.billing_address && (
                <Meta label="Billing address" value={account.billing_address} />
              )}
              {account.kyc_notes && (
                <Meta label="KYC notes" value={account.kyc_notes} />
              )}
              <Meta
                label="Created"
                value={new Date(account.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
              />
            </div>
          </div>

          {/* Contacts */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Contacts ({contactRows.length})</h2>
            </div>
            {contactRows.length === 0 ? (
              <div className="card-empty">No contacts yet.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {contactRows.map((c) => (
                  <li key={c.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>
                      {c.full_name} {c.is_primary && <span style={{ color: 'var(--color-gold-600)' }}>★</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                      {c.role_title ?? ''}{c.email ? ` · ${c.email}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
      <span style={{ color: 'var(--color-neutral-500)', minWidth: 110, fontSize: 12 }}>{label}</span>
      <span style={{ color: 'var(--color-neutral-900)' }}>{value}</span>
    </div>
  )
}
