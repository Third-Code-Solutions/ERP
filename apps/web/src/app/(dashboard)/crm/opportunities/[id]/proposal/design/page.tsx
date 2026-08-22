import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, desc } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  opportunities,
  accounts,
  designFiles,
  designFileVersions,
  documents,
} from '@third-code-erp/database/schema'
import { ProposalSubNav } from '@/components/proposal/sub-nav'
import { DesignUploadForm } from '@/components/proposal/design-upload-form'
import { DesignFileActions } from '@/components/proposal/design-file-actions'

interface PageProps {
  params: Promise<{ id: string }>
}

const FILE_TYPE_LABELS: Record<string, string> = {
  initial_layout: 'Initial Layout',
  final_rendering: 'Final Rendering',
  animation: 'Animation',
  revised: 'Revised',
}

const FILE_TYPE_ORDER = ['initial_layout', 'final_rendering', 'animation', 'revised'] as const

interface VersionRow {
  id: string
  version: number
  notes: string | null
  uploaded_at: Date
  file_name: string | null
}

interface DesignFileWithVersions {
  id: string
  name: string
  file_type: typeof FILE_TYPE_ORDER[number]
  is_ready_for_presentation: boolean
  is_client_approved: boolean
  client_approved_at: Date | null
  created_at: Date
  versions: VersionRow[]
}

export default async function DesignPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()
  const canUpload = can(profile.role, 'design.upload')
  const canMarkReady = can(profile.role, 'design.ready_for_presentation')
  const canMarkApproved = can(profile.role, 'design.approve_client')

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

  const fileRows = await db
    .select({
      id: designFiles.id,
      name: designFiles.name,
      file_type: designFiles.file_type,
      is_ready_for_presentation: designFiles.is_ready_for_presentation,
      is_client_approved: designFiles.is_client_approved,
      client_approved_at: designFiles.client_approved_at,
      created_at: designFiles.created_at,
    })
    .from(designFiles)
    .where(eq(designFiles.opportunity_id, id))
    .orderBy(desc(designFiles.created_at))

  const versions =
    fileRows.length === 0
      ? []
      : await db
          .select({
            id: designFileVersions.id,
            design_file_id: designFileVersions.design_file_id,
            version: designFileVersions.version,
            notes: designFileVersions.notes,
            uploaded_at: designFileVersions.uploaded_at,
            document_id: designFileVersions.document_id,
            file_name: documents.file_name,
          })
          .from(designFileVersions)
          .leftJoin(documents, eq(documents.id, designFileVersions.document_id))
          .where(
            eq(
              designFileVersions.tenant_id,
              profile.tenantId
            )
          )

  // Group versions per design file. Filter to versions of files on this opp.
  const fileIds = new Set(fileRows.map((f) => f.id))
  const grouped: DesignFileWithVersions[] = fileRows.map((f) => ({
    ...f,
    versions: versions
      .filter((v) => v.design_file_id === f.id && fileIds.has(v.design_file_id))
      .map((v) => ({
        id: v.id,
        version: v.version,
        notes: v.notes,
        uploaded_at: v.uploaded_at,
        file_name: v.file_name,
      }))
      .sort((a, b) => b.version - a.version),
  }))

  // Bucket by file_type.
  const buckets: Record<string, DesignFileWithVersions[]> = {}
  for (const type of FILE_TYPE_ORDER) buckets[type] = []
  for (const f of grouped) {
    const arr = buckets[f.file_type]
    if (arr) arr.push(f)
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
            <h1 className="page-title">Design files</h1>
            <p className="page-subtitle">
              Upload versions, mark ready, mark approved. Approving without changes locks the design and triggers BOM.
            </p>
          </div>
        </div>
      </div>

      <ProposalSubNav opportunityId={id} />

      <div className="section-grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {FILE_TYPE_ORDER.map((type) => {
            const bucket = buckets[type] ?? []
            const label = FILE_TYPE_LABELS[type] ?? type
            return (
            <div className="card" key={type}>
              <div className="card-header">
                <h2 className="card-title">{label} ({bucket.length})</h2>
              </div>
              {bucket.length === 0 ? (
                <div className="card-empty">No {label.toLowerCase()} files yet.</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {bucket.map((f) => (
                    <li
                      key={f.id}
                      style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: 14 }}>{f.name}</strong>{' '}
                          <span
                            className="stage-badge"
                            style={{
                              background: f.is_client_approved
                                ? '#dcfce7'
                                : f.is_ready_for_presentation
                                  ? '#fef9c3'
                                  : '#f3f4f6',
                              color: f.is_client_approved
                                ? '#15803d'
                                : f.is_ready_for_presentation
                                  ? '#ca8a04'
                                  : '#6b7280',
                            }}
                          >
                            <span className="stage-badge-dot" />
                            {f.is_client_approved
                              ? 'approved'
                              : f.is_ready_for_presentation
                                ? 'ready'
                                : 'draft'}
                          </span>
                        </div>
                        <DesignFileActions
                          designFileId={f.id}
                          isReadyForPresentation={f.is_ready_for_presentation}
                          isClientApproved={f.is_client_approved}
                          canMarkReady={canMarkReady}
                          canMarkApproved={canMarkApproved}
                        />
                      </div>

                      {f.versions.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--color-neutral-500)', margin: '0 0 8px' }}>
                          No versions uploaded yet.
                        </p>
                      ) : (
                        <table className="data-table" style={{ marginBottom: 8 }}>
                          <thead>
                            <tr>
                              <th>Version</th>
                              <th>File</th>
                              <th>Uploaded</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {f.versions.map((v) => (
                              <tr key={v.id}>
                                <td>v{v.version}</td>
                                <td className="muted">{v.file_name ?? '—'}</td>
                                <td className="muted">
                                  {new Date(v.uploaded_at).toLocaleDateString('en-PH', {
                                    year: 'numeric', month: 'short', day: 'numeric',
                                  })}
                                </td>
                                <td className="muted">{v.notes ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {canUpload && !f.is_client_approved && (
                        <details>
                          <summary style={{ fontSize: 12, color: 'var(--color-neutral-600)', cursor: 'pointer' }}>
                            Upload new version
                          </summary>
                          <div style={{ marginTop: 8 }}>
                            <DesignUploadForm
                              opportunityId={id}
                              designFileId={f.id}
                              defaultFileType={f.file_type}
                              defaultName={f.name}
                            />
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            )
          })}
        </div>

        {canUpload && (
        <aside>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">New design file</h2>
            </div>
            <div style={{ padding: 16 }}>
              <DesignUploadForm opportunityId={id} />
            </div>
          </div>
        </aside>
        )}
      </div>
    </div>
  )
}
