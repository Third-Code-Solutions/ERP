/**
 * Public warranty portal — token-gated, no login (REFACTOR.md US-WA-001).
 *
 * The URL token is SHA-256 hashed and matched against warranty_portal_tokens
 * (created by CX via mintWarrantyPortalToken). If revoked/expired we render a
 * dead end; otherwise the client can submit a new ticket against the linked
 * project. The tenant_id / project_id used by the submit action come from the
 * token row, NEVER from form data — this preserves tenant isolation.
 */

import { createHash } from 'node:crypto'
import { db } from '@buildops/database'
import { warrantyPortalTokens, projects, accounts } from '@buildops/database/schema'
import { and, eq } from 'drizzle-orm'
import { submitTicket } from './actions'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Warranty Support | ABI Ops',
  robots: { index: false, follow: false },
}

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

interface PageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ ok?: string; ticket?: string; error?: string }>
}

export default async function WarrantyPortalPage({ params, searchParams }: PageProps) {
  const { token } = await params
  const sp = await searchParams
  const tokenHash = hashToken(token)

  const [row] = await db
    .select({
      token_id: warrantyPortalTokens.id,
      tenant_id: warrantyPortalTokens.tenant_id,
      project_id: warrantyPortalTokens.project_id,
      expires_at: warrantyPortalTokens.expires_at,
      revoked_at: warrantyPortalTokens.revoked_at,
      project_name: projects.name,
      account_name: accounts.name,
    })
    .from(warrantyPortalTokens)
    .innerJoin(projects, eq(projects.id, warrantyPortalTokens.project_id))
    .leftJoin(accounts, eq(accounts.id, projects.account_id))
    .where(eq(warrantyPortalTokens.token_hash, tokenHash))
    .limit(1)

  const now = new Date()
  const isExpired =
    !row ||
    !!row.revoked_at ||
    (row.expires_at instanceof Date && row.expires_at.getTime() < now.getTime())

  if (!row || isExpired) {
    return (
      <section className="portal-card">
        <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Link expired</h2>
        <p style={{ margin: 0, color: '#525866' }}>
          This warranty support link is no longer valid. Please contact your project
          manager for a fresh link.
        </p>
      </section>
    )
  }

  if (sp.ok === '1' && sp.ticket) {
    return (
      <section className="portal-card">
        <p className="portal-success-eyebrow">Ticket submitted</p>
        <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>Thanks — we&apos;ve received it.</h2>
        <p style={{ margin: 0, color: '#525866' }}>
          Your reference number is <strong>{sp.ticket}</strong>. A confirmation
          email is on its way; our CX team will respond within 24 hours.
        </p>
        <a href={`/portal/warranty/${token}`} className="portal-link">
          Submit another ticket →
        </a>
        <style>{styles}</style>
      </section>
    )
  }

  const submit = submitTicket.bind(null, token)

  return (
    <section className="portal-card">
      <p className="portal-eyebrow-line">
        Project · <strong>{row.project_name}</strong>
        {row.account_name && <> · {row.account_name}</>}
      </p>
      <h2 style={{ margin: '0 0 4px', fontSize: 26, letterSpacing: '-0.01em' }}>
        Report a warranty issue
      </h2>
      <p style={{ margin: '0 0 24px', color: '#525866' }}>
        Tell us what&apos;s wrong and we&apos;ll dispatch the right team. SLA: 24h
        acknowledgement, 48h repair scheduling.
      </p>

      {sp.error && (
        <div className="portal-alert">
          {sp.error === 'invalid' ? 'Please fill in all required fields.' : sp.error}
        </div>
      )}

      <form action={submit} className="portal-form">
        <div className="portal-row">
          <label>
            <span className="portal-label">Your name *</span>
            <input name="submitted_by_name" required maxLength={255} />
          </label>
          <label>
            <span className="portal-label">Your email *</span>
            <input name="submitted_by_email" type="email" required maxLength={255} />
          </label>
        </div>

        <div className="portal-row">
          <label>
            <span className="portal-label">Category *</span>
            <select name="category" required defaultValue="other">
              <option value="civil">Civil works</option>
              <option value="electrical">Electrical</option>
              <option value="plumbing">Plumbing</option>
              <option value="mep">Mechanical / HVAC</option>
              <option value="finishes">Finishes</option>
              <option value="fixtures">Fixtures</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span className="portal-label">Location on site</span>
            <input
              name="location"
              maxLength={255}
              placeholder="e.g. 5F Pantry, Unit 1203"
            />
          </label>
        </div>

        <label>
          <span className="portal-label">Describe the issue *</span>
          <textarea
            name="description"
            required
            rows={6}
            maxLength={4000}
            placeholder="What happened, when did you notice it, and what's affected?"
          />
        </label>

        <p className="portal-note">
          Photos: please email up to 5 images to <code>cx@abi.ph</code> with your
          reference number after submitting. (Portal upload coming soon.)
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="portal-cta">
            Submit ticket →
          </button>
        </div>
      </form>

      <style>{styles}</style>
    </section>
  )
}

const styles = `
  .portal-card {
    background: white;
    border: 1px solid #e1e4ea;
    border-radius: 12px;
    padding: 32px;
    box-shadow: 0 1px 0 rgba(15, 45, 74, 0.04);
  }
  .portal-eyebrow-line {
    margin: 0 0 12px;
    color: #525866;
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .portal-success-eyebrow {
    margin: 0 0 8px;
    color: #1f7a4d;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .portal-link {
    display: inline-block;
    margin-top: 20px;
    color: #0F2D4A;
    font-weight: 500;
  }
  .portal-form { display: flex; flex-direction: column; gap: 16px; }
  .portal-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .portal-form label { display: flex; flex-direction: column; gap: 6px; }
  .portal-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #14213d;
  }
  .portal-form input, .portal-form select, .portal-form textarea {
    border: 1px solid #d0d5dd;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: inherit;
    background: white;
  }
  .portal-form textarea { resize: vertical; min-height: 120px; }
  .portal-note { margin: 4px 0 12px; color: #525866; font-size: 12.5px; }
  .portal-note code {
    background: #f3f4f6;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12.5px;
  }
  .portal-cta {
    background: #0F2D4A;
    color: white;
    border: none;
    padding: 12px 22px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    letter-spacing: 0.01em;
  }
  .portal-cta:hover { background: #11375a; }
  .portal-alert {
    background: #fef3f2;
    border: 1px solid #f4b4b4;
    color: #8a2222;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 8px;
  }
  @media (max-width: 640px) {
    .portal-row { grid-template-columns: 1fr; }
    .portal-card { padding: 22px; }
  }
`
