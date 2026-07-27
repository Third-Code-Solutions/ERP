import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  certificatesOfCompletion,
  documents,
  projects,
  turnoverPackages,
} from '@third-code-erp/database/schema'
import { draftCoc, sendCocForSignature } from './actions'

export const metadata: Metadata = { title: 'Certificate of Completion' }

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_signature: 'Pending client signature',
  signed: 'Signed',
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'stage-badge stage-opportunity_creation',
  pending_signature: 'stage-badge stage-negotiation',
  signed: 'stage-badge stage-closed_won',
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function CocPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return notFound()

  const [pkg] = await db
    .select({ compiled_at: turnoverPackages.compiled_at })
    .from(turnoverPackages)
    .where(
      and(
        eq(turnoverPackages.project_id, id),
        eq(turnoverPackages.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  const [coc] = await db
    .select()
    .from(certificatesOfCompletion)
    .where(
      and(
        eq(certificatesOfCompletion.project_id, id),
        eq(certificatesOfCompletion.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  // Hydrate the signed document filename for the link, if present.
  let signedDocName: string | null = null
  if (coc?.signed_document_id) {
    const [doc] = await db
      .select({ file_name: documents.file_name })
      .from(documents)
      .where(eq(documents.id, coc.signed_document_id))
      .limit(1)
    signedDocName = doc?.file_name ?? null
  }

  const turnoverCompiled = !!pkg?.compiled_at
  const baseHref = `/projects/${id}`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Link
          href="/projects"
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          Projects
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <Link
          href={baseHref}
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          {project.name}
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>
          Certificate of Completion
        </span>
      </div>

      <div className="page-header">
        <p className="page-eyebrow">Post-Construction</p>
        <h1 className="page-title">Certificate of Completion</h1>
        <p className="page-subtitle">
          Once signed, the warranty window opens and CX takes the lead on customer onboarding.
        </p>
      </div>

      {/* No COC yet */}
      {!coc ? (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          {turnoverCompiled ? (
            <>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Draft the COC
              </h2>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>
                The turnover package is compiled. Drafting the COC creates the document for client signature.
              </p>
              <form
                action={async () => {
                  'use server'
                  await draftCoc(id)
                }}
              >
                <button
                  type="submit"
                  style={{
                    background: 'var(--color-navy-700)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    padding: '10px 18px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Draft COC
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Turnover not yet compiled
              </h2>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>
                Complete the turnover package before drafting the certificate.
              </p>
              <Link
                href={`${baseHref}/turnover`}
                style={{
                  background: 'var(--color-navy-700)',
                  color: 'white',
                  borderRadius: 6,
                  padding: '10px 18px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Go to turnover →
              </Link>
            </>
          )}
        </div>
      ) : (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Status header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className={STATUS_BADGE[coc.status] ?? 'stage-badge'}>
              <span className="stage-badge-dot" />
              {STATUS_LABEL[coc.status] ?? coc.status}
            </span>
            {coc.docuseal_submission_id ? (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-neutral-500)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                DocuSeal: {coc.docuseal_submission_id}
              </span>
            ) : null}
          </div>

          {/* Field grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 16,
            }}
          >
            <Field label="Drafted" value={fmtDate(coc.created_at)} />
            <Field label="Signed" value={fmtDate(coc.signed_at)} />
            <Field
              label="Warranty starts"
              value={fmtDate(coc.warranty_period_starts_at)}
            />
            <Field
              label="Warranty ends"
              value={fmtDate(coc.warranty_period_ends_at)}
            />
          </div>

          {/* Signed document link */}
          {coc.status === 'signed' && signedDocName ? (
            <div
              style={{
                background: '#dcfce7',
                color: '#166534',
                padding: 14,
                borderRadius: 6,
                fontSize: '0.8125rem',
              }}
            >
              Signed document:{' '}
              <Link
                href={`${baseHref}/documents`}
                style={{ color: '#166534', fontWeight: 600 }}
              >
                {signedDocName}
              </Link>
            </div>
          ) : null}

          {/* Actions */}
          {coc.status === 'draft' ? (
            <form
              action={async () => {
                'use server'
                await sendCocForSignature(id)
              }}
            >
              <button
                type="submit"
                style={{
                  background: 'var(--color-navy-700)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 18px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Send for client signature
              </button>
            </form>
          ) : null}

          {coc.status === 'pending_signature' ? (
            <p
              style={{
                margin: 0,
                fontSize: '0.8125rem',
                color: 'var(--color-neutral-600)',
                background: 'var(--color-neutral-50)',
                padding: 12,
                borderRadius: 6,
              }}
            >
              Awaiting client signature in DocuSeal. The webhook handler will record the signed document once complete.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--color-neutral-900)' }}>{value}</div>
    </div>
  )
}
