import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { documents, projects, users } from '@buildops/database/schema'
import { and, eq, desc } from 'drizzle-orm'
import { UploadButton } from '@/components/documents/upload-button'

export const metadata: Metadata = { title: 'Documents' }

const DOC_TYPE_LABELS: Record<string, string> = {
  dxf: 'DXF Drawing',
  pdf: 'PDF',
  contract: 'Contract',
  bom: 'Bill of Materials',
  invoice: 'Invoice',
  po: 'Purchase Order',
  image: 'Image',
  other: 'Other',
}

const DOC_TYPE_COLORS: Record<string, string> = {
  dxf: '#6366f1',
  pdf: '#ef4444',
  contract: '#8b5cf6',
  bom: '#f59e0b',
  invoice: '#10b981',
  po: '#f97316',
  image: '#06b6d4',
  other: '#9ca3af',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
]

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, userRow.tenant_id)))

  if (!project) return notFound()

  const docs = await db
    .select({
      id: documents.id,
      file_name: documents.file_name,
      document_type: documents.document_type,
      size_bytes: documents.size_bytes,
      mime_type: documents.mime_type,
      description: documents.description,
      created_at: documents.created_at,
    })
    .from(documents)
    .where(and(eq(documents.project_id, id), eq(documents.tenant_id, userRow.tenant_id)))
    .orderBy(desc(documents.created_at))

  return (
    <div>
      {/* Breadcrumb + tabs */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-400)', marginBottom: '8px' }}>
          <Link href="/projects" style={{ color: 'var(--color-neutral-400)', textDecoration: 'none' }}>Projects</Link>
          {' / '}
          <Link href={`/projects/${id}`} style={{ color: 'var(--color-neutral-400)', textDecoration: 'none' }}>{project.name}</Link>
          {' / '}
          <span style={{ color: 'var(--color-neutral-700)' }}>Documents</span>
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)', margin: '0 0 16px' }}>
          {project.name}
        </h1>
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)' }}>
          {TABS.map(({ label, href }) => {
            const isActive = href === '/documents'
            return (
              <Link
                key={href}
                href={`/projects/${id}${href}`}
                style={{
                  padding: '8px 20px',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-navy-700)' : 'var(--color-neutral-500)',
                  textDecoration: 'none',
                  borderBottom: isActive ? '2px solid var(--color-navy-700)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-500)', margin: 0 }}>
          {docs.length} file{docs.length !== 1 ? 's' : ''}
        </p>
        <UploadButton projectId={id} />
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
            Use the Upload button above to add DXFs, PDFs, or images.{' '}
            <Link href="/documents" style={{ color: 'var(--color-navy-700)' }}>View all documents</Link>
          </p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
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
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-neutral-400)', marginTop: '2px' }}>
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

      <div
        style={{
          marginTop: '24px',
          background: 'var(--color-navy-50)',
          border: '1px solid var(--color-navy-100)',
          borderRadius: '8px',
          padding: '16px 20px',
          fontSize: '0.8125rem',
          color: 'var(--color-navy-700)',
        }}
      >
        DXF uploads trigger automatic scope extraction. In-browser preview and version history are coming in Phase 3.
      </div>
    </div>
  )
}
