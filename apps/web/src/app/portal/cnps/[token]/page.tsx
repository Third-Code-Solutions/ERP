/**
 * Public CNPS rating page (REFACTOR.md US-WA-003 #2).
 *
 * One-question 0-10 NPS scale + optional comment. Token-gated, no login.
 * If already responded, show thank-you state.
 */

import { createHash } from 'node:crypto'
import { db } from '@buildops/database'
import { cnpsSurveys, warrantyTickets } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'
import { submitCnpsRating } from './actions'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Rate our service | ABI Ops',
  robots: { index: false, follow: false },
}

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

interface PageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ ok?: string }>
}

export default async function CnpsPortalPage({ params, searchParams }: PageProps) {
  const { token } = await params
  const sp = await searchParams
  const tokenHash = hashToken(token)

  const [row] = await db
    .select({
      survey_id: cnpsSurveys.id,
      tenant_id: cnpsSurveys.tenant_id,
      ticket_id: cnpsSurveys.ticket_id,
      responded_at: cnpsSurveys.responded_at,
      score: cnpsSurveys.score,
      ticket_number: warrantyTickets.ticket_number,
    })
    .from(cnpsSurveys)
    .innerJoin(warrantyTickets, eq(warrantyTickets.id, cnpsSurveys.ticket_id))
    .where(eq(cnpsSurveys.response_token_hash, tokenHash))
    .limit(1)

  if (!row) {
    return (
      <section className="cnps-card">
        <h2 style={{ margin: '0 0 6px', fontSize: 22 }}>Link not recognised</h2>
        <p style={{ margin: 0, color: '#525866' }}>
          This survey link is invalid or has expired.
        </p>
        <style>{styles}</style>
      </section>
    )
  }

  if (row.responded_at || sp.ok === '1') {
    return (
      <section className="cnps-card cnps-card-success">
        <p className="cnps-eyebrow-success">Thank you</p>
        <h2 style={{ margin: '0 0 8px', fontSize: 26 }}>
          Already submitted — we appreciate it.
        </h2>
        <p style={{ margin: 0, color: '#525866' }}>
          Your feedback on ticket {row.ticket_number} has been recorded.
        </p>
        <style>{styles}</style>
      </section>
    )
  }

  const submit = submitCnpsRating.bind(null, token)

  return (
    <section className="cnps-card">
      <p className="cnps-eyebrow">Customer experience survey</p>
      <h2 style={{ margin: '0 0 6px', fontSize: 26, letterSpacing: '-0.01em' }}>
        How did we do?
      </h2>
      <p style={{ margin: '0 0 22px', color: '#525866' }}>
        On a scale of 0–10, how likely are you to recommend Actuate Builders Inc.
        based on your experience with ticket <strong>{row.ticket_number}</strong>?
      </p>

      <form action={submit}>
        <div className="cnps-scale" role="radiogroup" aria-label="Score from 0 to 10">
          {Array.from({ length: 11 }, (_, i) => (
            <label key={i} className="cnps-num">
              <input type="radio" name="score" value={i} required />
              <span>{i}</span>
            </label>
          ))}
        </div>

        <div className="cnps-scale-labels">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>

        <label style={{ display: 'block', marginTop: 24 }}>
          <span className="cnps-label">Anything we should know? (optional)</span>
          <textarea
            name="comment"
            rows={4}
            maxLength={2000}
            placeholder="Your comments help us improve."
          />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="submit" className="cnps-cta">
            Submit rating →
          </button>
        </div>
      </form>

      <style>{styles}</style>
    </section>
  )
}

const styles = `
  .cnps-card {
    background: white;
    border: 1px solid #e1e4ea;
    border-radius: 12px;
    padding: 36px;
    box-shadow: 0 1px 0 rgba(15, 45, 74, 0.04);
  }
  .cnps-card-success { background: #f5fbf7; border-color: #c9e7d3; }
  .cnps-eyebrow {
    margin: 0 0 14px;
    color: #525866;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .cnps-eyebrow-success {
    margin: 0 0 8px;
    color: #1f7a4d;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .cnps-scale {
    display: grid;
    grid-template-columns: repeat(11, 1fr);
    gap: 8px;
    margin-top: 20px;
  }
  .cnps-num {
    position: relative;
  }
  .cnps-num input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
  .cnps-num span {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 56px;
    border: 1.5px solid #d0d5dd;
    border-radius: 8px;
    font-weight: 600;
    font-size: 16px;
    color: #14213d;
    cursor: pointer;
    transition: all 0.12s ease;
    background: white;
  }
  .cnps-num input:checked + span {
    background: #0F2D4A;
    color: white;
    border-color: #0F2D4A;
    transform: translateY(-2px);
  }
  .cnps-num span:hover {
    border-color: #0F2D4A;
  }
  .cnps-scale-labels {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #525866;
    margin-top: 8px;
    letter-spacing: 0.02em;
  }
  .cnps-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #14213d;
    margin-bottom: 6px;
  }
  .cnps-card textarea {
    width: 100%;
    border: 1px solid #d0d5dd;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: inherit;
    resize: vertical;
  }
  .cnps-cta {
    background: #0F2D4A;
    color: white;
    border: none;
    padding: 12px 22px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }
  .cnps-cta:hover { background: #11375a; }
  @media (max-width: 640px) {
    .cnps-scale { grid-template-columns: repeat(6, 1fr); }
    .cnps-card { padding: 22px; }
  }
`
