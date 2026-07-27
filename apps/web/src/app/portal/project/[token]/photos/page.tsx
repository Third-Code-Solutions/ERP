import type { Metadata } from 'next'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { documents, projects, accounts } from '@third-code-erp/database/schema'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import {
  findActiveCustomerSession,
  logCustomerView,
} from '@/lib/operations/customer-portal'

export const metadata: Metadata = {
  title: 'Project photos',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface PhotoTile {
  id: string
  file_name: string
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

export default async function PortalProjectPhotosPage({
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
        body="This portal link doesn't match an active project, has expired, or has been revoked. Please ask your project contact to send a new one."
      />
    )
  }

  await logCustomerView(session.id)

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

  const rows = await db
    .select({
      id: documents.id,
      file_name: documents.file_name,
      storage_path: documents.storage_path,
      created_at: documents.created_at,
    })
    .from(documents)
    .where(
      and(
        eq(documents.tenant_id, session.tenant_id),
        eq(documents.project_id, session.project_id),
        eq(documents.document_type, 'image')
      )
    )
    .orderBy(desc(documents.created_at))
    .limit(50)

  const supabase = createSupabaseAdminClient()
  const tiles: PhotoTile[] = []
  for (const r of rows) {
    let url: string | null = null
    try {
      const { data } = await supabase.storage
        .from('documents')
        .createSignedUrl(r.storage_path, 60)
      url = data?.signedUrl ?? null
    } catch {
      url = null
    }
    tiles.push({
      id: r.id,
      file_name: r.file_name,
      created_at: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
      signed_url: url,
    })
  }

  return (
    <div>
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
          Site photos
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
          {tiles.length} photo{tiles.length === 1 ? '' : 's'} from the project site. Click a tile to open the full-resolution image in a new tab.
        </p>
      </section>

      {tiles.length === 0 ? (
        <section
          style={{
            background: 'white',
            border: '1px dashed #d8dde6',
            borderRadius: 10,
            padding: '40px 32px',
            textAlign: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, color: '#0F2D4A' }}>No site photos yet</h3>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#6b7280', lineHeight: 1.55 }}>
            Photos uploaded by your project team will appear here.
          </p>
        </section>
      ) : (
        <div className="photo-grid">
          {tiles.map((p) => (
            <a
              key={p.id}
              href={p.signed_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="photo-tile"
              aria-disabled={!p.signed_url}
              onClick={p.signed_url ? undefined : (e) => e.preventDefault()}
            >
              <div className="photo-thumb">
                {p.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.signed_url}
                    alt={p.file_name}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9ca3af',
                      fontSize: 12,
                    }}
                  >
                    Unavailable
                  </div>
                )}
              </div>
              <div className="photo-meta">
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#0F2D4A',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.file_name}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#6b7280' }}>
                  {fmtDate(p.created_at)}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}

      <style>{`
        .photo-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 720px) {
          .photo-grid { grid-template-columns: 1fr; }
        }
        .photo-tile {
          display: block;
          background: white;
          border: 1px solid #d8dde6;
          border-radius: 10px;
          overflow: hidden;
          text-decoration: none;
          color: inherit;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .photo-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 14px rgba(15, 45, 74, 0.1);
        }
        .photo-thumb {
          aspect-ratio: 4 / 3;
          background: #eef0f3;
          overflow: hidden;
        }
        .photo-meta {
          padding: 12px 14px;
        }
      `}</style>
    </div>
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
