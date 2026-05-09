import type { Metadata } from 'next'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { documents, projects, users } from '@buildops/database/schema'
import { and, eq, desc } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Documents' }

const DOC_TYPE_LABELS: Record<string, string> = {
  dxf: 'DXF Drawing',
  pdf: 'PDF',
  contract: 'Contract',
  bom: 'Bill of Materials',
  invoice: 'Invoice',
  purchase_order: 'Purchase Order',
  image: 'Image',
  other: 'Other',
}

const DOC_TYPE_COLORS: Record<string, string> = {
  dxf: '#6366f1',
  pdf: '#ef4444',
  contract: '#8b5cf6',
  bom: '#f59e0b',
  invoice: '#10b981',
  purchase_order: '#f97316',
  image: '#06b6d4',
  other: '#9ca3af',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function DocumentsPage() {
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))

  if (!userRow?.tenant_id) return null

  const docs = await db
    .select({
      id: documents.id,
      file_name: documents.file_name,
      document_type: documents.document_type,
      size_bytes: documents.size_bytes,
      mime_type: documents.mime_type,
      description: documents.description,
      created_at: documents.created_at,
      project_name: projects.name,
      project_id: projects.id,
    })
    .from(documents)
    .leftJoin(projects, eq(documents.project_id, projects.id))
    .where(eq(documents.tenant_id, userRow.tenant_id))
    .orderBy(desc(documents.created_at))

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}
      >
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">
            {docs.length} file{docs.length !== 1 ? 's' : ''} across all projects
          </p>
        </div>
      </div>

      {docs.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '64px 24px',
            textAlign: 'center',
            color: 'var(--color-neutral-400)',
          }}
        >
          <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>No documents uploaded yet.</p>
          <p style={{ fontSize: '0.8125rem' }}>
            Documents uploaded to projects will appear here.{' '}
            <Link href="/projects" style={{ color: 'var(--color-navy-700)' }}>
              Go to Projects
            </Link>
          </p>
        </div>
      ) : (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>Project</th>
                <th className="numeric">Size</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <span style={{ fontWeight: 500, color: 'var(--color-neutral-900)' }}>
                      {doc.file_name}
                    </span>
                    {doc.description && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.75rem',
                          color: 'var(--color-neutral-400)',
                          marginTop: '2px',
                        }}
                      >
                        {doc.description}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className="stage-badge"
                      style={{
                        color: DOC_TYPE_COLORS[doc.document_type] ?? '#9ca3af',
                        background: (DOC_TYPE_COLORS[doc.document_type] ?? '#9ca3af') + '18',
                      }}
                    >
                      {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                    </span>
                  </td>
                  <td>
                    {doc.project_id ? (
                      <Link
                        href={`/projects/${doc.project_id}`}
                        style={{
                          color: 'var(--color-navy-700)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                        }}
                      >
                        {doc.project_name ?? '—'}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
                    )}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {formatBytes(doc.size_bytes)}
                  </td>
                  <td style={{ color: 'var(--color-neutral-500)', fontSize: '0.8125rem' }}>
                    {new Date(doc.created_at).toLocaleDateString('en-PH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
