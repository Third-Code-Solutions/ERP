import type { Metadata } from 'next'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@buildops/database'
import { documents, projects, accounts } from '@buildops/database/schema'
import { createSupabaseAdminClient } from '@buildops/auth/server'
import {
  findActiveCustomerSession,
  logCustomerView,
} from '@/lib/abi/customer-portal'

export const metadata: Metadata = {
  title: 'Project documents',
  robots: { index: false, follow: false },
}

// Tokens are per-link; never cache.
export const dynamic = 'force-dynamic'

const DOC_TYPES = ['contract', 'bom', 'invoice', 'po', 'other'] as const
type DocType = (typeof DOC_TYPES)[number]

const TYPE_LABELS: Record<DocType, string> = {
  contract: 'Contracts',
  bom: 'Bills of Materials',
  invoice: 'Invoices',
  po: 'Purchase Orders',
  other: 'Other',
}

const TYPE_BADGE_TONES: Record<DocType, string> = {
  contract: '#0F2D4A',
  bom: '#0d5c3a',
  invoice: '#7a4a00',
  po: '#5b3a85',
  other: '#4b5563',
}

interface DocRow {
  id: string
  file_name: string
  document_type: DocType
  storage_path: string
  size_bytes: number
  created_at: Date
  signed_url: string | null
}

function fmtDate(d: Date): string {
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default async function PortalProjectDocumentsPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const session = await findActiveCustomerSession(token)
  if (!session) {
    return (
      <PortalStatus
        title="Link expired or invalid"
        body="This portal link doesn't match an active project, has expired, or has been revoked. Please ask your ABI contact to send a new one."
      />
    )
  }

  // Record the view — best-effort.
  await logCustomerView(session.id)

  // Project + account header.
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      account_name: accounts.name,
    })
    .from(projects)
    .leftJoin(accounts, eq(projects.account_id, accounts.id))
    .where(
      and(
        eq(projects.id, session.project_id),
        eq(projects.tenant_id, session.tenant_id)
      )
    )
    .limit(1)

  if (!project) {
    return (
      <PortalStatus
        title="Project unavailable"
        body="The project linked to this portal session is no longer available."
      />
    )
  }

  // SELECT documents for the project with allowed types. Limit 50.
  const rows = await db
    .select({
      id: documents.id,
      file_name: documents.file_name,
      document_type: documents.document_type,
      storage_path: documents.storage_path,
      size_bytes: documents.size_bytes,
      created_at: documents.created_at,
    })
    .from(documents)
    .where(
      and(
        eq(documents.tenant_id, session.tenant_id),
        eq(documents.project_id, session.project_id),
        inArray(documents.document_type, [...DOC_TYPES])
      )
    )
    .orderBy(desc(documents.created_at))
    .limit(50)

  // Mint short-lived signed URLs (60s) for each row.
  const supabase = createSupabaseAdminClient()
  const withUrls: DocRow[] = []
  for (const r of rows) {
    let signedUrl: string | null = null
    try {
      const { data } = await supabase.storage
        .from('documents')
        .createSignedUrl(r.storage_path, 60)
      signedUrl = data?.signedUrl ?? null
    } catch {
      signedUrl = null
    }
    withUrls.push({
      id: r.id,
      file_name: r.file_name,
      document_type: r.document_type as DocType,
      storage_path: r.storage_path,
      size_bytes: r.size_bytes,
      created_at: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
      signed_url: signedUrl,
    })
  }

  // Group by document_type, preserving section order from DOC_TYPES.
  const groups = new Map<DocType, DocRow[]>()
  for (const t of DOC_TYPES) groups.set(t, [])
  for (const row of withUrls) {
    const arr = groups.get(row.document_type)
    if (arr) arr.push(row)
  }

  const totalCount = withUrls.length

  return (
    <div>
      {/* Header card */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          padding: '24px 28px',
          marginBottom: 20,
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.05)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#6b7280',
            fontWeight: 600,
          }}
        >
          Documents
        </p>
        <h2 style={{ margin: '6px 0 4px', fontSize: 22, color: '#0F2D4A', fontWeight: 600 }}>
          {project.name}
        </h2>
        {project.account_name && (
          <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>
            Prepared for <strong>{project.account_name}</strong>
          </p>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#6b7280' }}>
          {totalCount} document{totalCount === 1 ? '' : 's'} shared with you. Download links expire after 60 seconds — refresh the page to mint new ones.
        </p>
      </section>

      {totalCount === 0 ? (
        <EmptyState
          title="No documents yet"
          body="Once your ABI team uploads contracts, BOMs, invoices, or other project documents, they'll appear here."
        />
      ) : (
        DOC_TYPES.map((type) => {
          const list = groups.get(type) ?? []
          if (list.length === 0) return null
          return (
            <section
              key={type}
              style={{
                background: 'white',
                border: '1px solid #d8dde6',
                borderRadius: 10,
                overflow: 'hidden',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  background: '#0F2D4A',
                  color: 'white',
                  padding: '10px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                <span>{TYPE_LABELS[type]}</span>
                <span style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>
                  {list.length}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fafbfc' }}>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '8px 18px',
                        fontSize: 11,
                        color: '#6b7280',
                      }}
                    >
                      File
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        fontSize: 11,
                        color: '#6b7280',
                      }}
                    >
                      Type
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '8px 12px',
                        fontSize: 11,
                        color: '#6b7280',
                      }}
                    >
                      Size
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        fontSize: 11,
                        color: '#6b7280',
                      }}
                    >
                      Uploaded
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '8px 18px',
                        fontSize: 11,
                        color: '#6b7280',
                      }}
                    />
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #f1f3f6' }}>
                      <td style={{ padding: '12px 18px', color: '#0F2D4A', fontWeight: 500 }}>
                        {d.file_name}
                      </td>
                      <td style={{ padding: '12px 12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'white',
                            background: TYPE_BADGE_TONES[d.document_type],
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {d.document_type}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '12px 12px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-jetbrains), monospace',
                          color: '#4b5563',
                        }}
                      >
                        {fmtBytes(d.size_bytes)}
                      </td>
                      <td style={{ padding: '12px 12px', color: '#4b5563' }}>
                        {fmtDate(d.created_at)}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                        {d.signed_url ? (
                          <a
                            href={d.signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#0F2D4A',
                              fontWeight: 600,
                              fontSize: 12.5,
                              textDecoration: 'none',
                              padding: '6px 12px',
                              border: '1px solid #0F2D4A',
                              borderRadius: 6,
                            }}
                          >
                            Download
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 12 }}>Unavailable</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        })
      )}
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section
      style={{
        background: 'white',
        border: '1px dashed #d8dde6',
        borderRadius: 10,
        padding: '40px 32px',
        textAlign: 'center',
      }}
    >
      <h3 style={{ margin: 0, fontSize: 16, color: '#0F2D4A' }}>{title}</h3>
      <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#6b7280', lineHeight: 1.55 }}>{body}</p>
    </section>
  )
}

function PortalStatus({ title, body }: { title: string; body: string }) {
  return (
    <section
      style={{
        background: 'white',
        border: '1px solid #d8dde6',
        borderRadius: 10,
        padding: '40px 32px',
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 22, color: '#4b5563' }}>{title}</h2>
      <p style={{ margin: '10px 0 0', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{body}</p>
    </section>
  )
}
