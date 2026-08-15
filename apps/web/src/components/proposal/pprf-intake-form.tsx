'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPprfIntake } from '@/app/(dashboard)/crm/opportunities/new/pprf/actions'
import { ActionFeedback } from '@/components/ui/action-feedback'

const inputClass = 'form-input'

export function PprfIntakeForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createPprfIntake(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.opportunityId) {
        router.push(`/crm/opportunities/${result.opportunityId}/proposal/pprf`)
      }
    })
  }

  return (
    <form
      action={submit}
      className="pprf-intake-form"
      aria-busy={pending}
      aria-describedby="pprf-intake-form-status"
    >
      <section className="intake-section">
        <div className="intake-section-heading">
          <div>
            <p className="page-eyebrow">01 · Client</p>
            <h2>Client record</h2>
          </div>
          <p>Creates one tenant-scoped client and links opportunity ownership.</p>
        </div>
        <div className="form-row form-row-2col">
          <div>
            <label className="form-label" htmlFor="client_name">Client / company name *</label>
            <input id="client_name" name="client_name" required minLength={2} className={inputClass} autoComplete="organization" />
          </div>
          <div>
            <label className="form-label" htmlFor="industry">Industry *</label>
            <select id="industry" name="industry" className={inputClass} defaultValue="other">
              <option value="retail">Retail</option>
              <option value="office">Office</option>
              <option value="food_and_beverage">Food and beverage</option>
              <option value="healthcare">Healthcare</option>
              <option value="hospitality">Hospitality</option>
              <option value="industrial">Industrial</option>
              <option value="residential">Residential</option>
              <option value="mixed_use">Mixed use</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="billing_address">Billing address</label>
          <textarea id="billing_address" name="billing_address" rows={2} className={inputClass} />
        </div>
        <div className="form-row form-row-2col">
          <div>
            <label className="form-label" htmlFor="primary_email">Primary email</label>
            <input id="primary_email" name="primary_email" type="email" className={inputClass} autoComplete="email" />
          </div>
          <div>
            <label className="form-label" htmlFor="primary_phone">Primary phone</label>
            <input id="primary_phone" name="primary_phone" type="tel" className={inputClass} autoComplete="tel" />
          </div>
        </div>
      </section>

      <section className="intake-section">
        <div className="intake-section-heading">
          <div>
            <p className="page-eyebrow">02 · Opportunity</p>
            <h2>Commercial brief</h2>
          </div>
          <p>Money stores as integer PHP centavos. No client-side approval bypass.</p>
        </div>
        <div className="form-row form-row-2col">
          <div>
            <label className="form-label" htmlFor="tcv">Expected TCV (₱)</label>
            <input id="tcv" name="tcv" type="number" min="0" step="0.01" defaultValue="0" className={inputClass} />
          </div>
          <div>
            <label className="form-label" htmlFor="gp">Expected GP (₱)</label>
            <input id="gp" name="gp" type="number" min="0" step="0.01" defaultValue="0" className={inputClass} />
          </div>
        </div>
        <div className="form-row form-row-2col">
          <div>
            <label className="form-label" htmlFor="opportunity_type">Project type</label>
            <select id="opportunity_type" name="opportunity_type" className={inputClass} defaultValue="">
              <option value="">Select type</option>
              <option value="mep">MEP</option>
              <option value="fit_out">Fit-out</option>
              <option value="interior">Interior</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="closing_date">Expected close</label>
            <input id="closing_date" name="closing_date" type="date" className={inputClass} />
          </div>
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="remarks">Commercial notes</label>
          <textarea id="remarks" name="remarks" rows={3} className={inputClass} />
        </div>
      </section>

      <section className="intake-section">
        <div className="intake-section-heading">
          <div>
            <p className="page-eyebrow">03 · PPRF</p>
            <h2>Project pre-requirements</h2>
          </div>
          <p>Submission opens Financial Evaluation and Credit Investigation tracks.</p>
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="site_address">Site address *</label>
          <textarea id="site_address" name="site_address" required minLength={2} rows={2} className={inputClass} />
        </div>
        <div className="form-row form-row-2col">
          <div>
            <label className="form-label" htmlFor="floor_area_sqm">Floor area (sqm) *</label>
            <input id="floor_area_sqm" name="floor_area_sqm" type="number" min="0.01" step="0.01" required className={inputClass} />
          </div>
          <div>
            <label className="form-label" htmlFor="landlord_contact">Landlord contact *</label>
            <input id="landlord_contact" name="landlord_contact" required minLength={2} className={inputClass} />
          </div>
        </div>
        <div className="form-row form-row-2col">
          <div>
            <label className="form-label" htmlFor="as_built_available">As-built availability *</label>
            <select id="as_built_available" name="as_built_available" required className={inputClass} defaultValue="no">
              <option value="yes">Yes</option>
              <option value="partial">Partial</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="expected_start_date">Expected start</label>
            <input id="expected_start_date" name="expected_start_date" type="date" className={inputClass} />
          </div>
        </div>
        <div className="form-row form-row-2col">
          <div>
            <label className="form-label" htmlFor="project_type">PPRF project type</label>
            <input id="project_type" name="project_type" className={inputClass} />
          </div>
          <div>
            <label className="form-label" htmlFor="budget_range">Budget range</label>
            <input id="budget_range" name="budget_range" className={inputClass} placeholder="₱5M – ₱8M" />
          </div>
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="scope_notes">Scope notes</label>
          <textarea id="scope_notes" name="scope_notes" rows={5} className={inputClass} />
        </div>
      </section>

      <ActionFeedback
        id="pprf-intake-form-status"
        error={error}
        pending={pending}
        pendingMessage="Creating client and review tracks…"
      />
      <div className="intake-actions">
        <button type="button" className="button-secondary" onClick={() => router.back()} disabled={pending}>Cancel</button>
        <button type="submit" className="button-primary" disabled={pending}>
          {pending ? 'Creating review tracks…' : 'Create client + submit PPRF'}
        </button>
      </div>

      <style>{`
        .pprf-intake-form { display: flex; flex-direction: column; gap: 18px; }
        .intake-section { border: 1px solid var(--color-border); border-radius: 8px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
        .intake-section-heading { display: flex; justify-content: space-between; gap: 18px; align-items: start; border-bottom: 1px solid var(--color-border); padding-bottom: 12px; }
        .intake-section-heading h2 { margin: 2px 0 0; font-size: 1rem; }
        .intake-section-heading p:last-child { margin: 4px 0 0; max-width: 280px; color: var(--color-neutral-500); font-size: 12px; line-height: 1.5; text-align: right; }
        .form-row { display: flex; flex-direction: column; gap: 6px; }
        .form-row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-label { font-size: 12px; font-weight: 600; color: var(--color-neutral-700); }
        .form-input { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; padding: 9px 10px; background: white; border: 1px solid var(--color-border); border-radius: 5px; color: var(--color-neutral-900); }
        .form-input:focus { outline: 0; border-color: var(--color-navy-500); box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-navy-500) 18%, transparent); }
        .form-error { color: var(--color-danger); font-size: 13px; margin: 0; }
        .intake-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .button-primary, .button-secondary { border-radius: 5px; padding: 9px 14px; font: inherit; font-size: 13px; cursor: pointer; }
        .button-primary { border: 1px solid var(--color-navy-700); background: var(--color-navy-700); color: white; font-weight: 600; }
        .button-secondary { border: 1px solid var(--color-border); background: white; color: var(--color-neutral-700); }
        button:disabled { cursor: wait; opacity: .65; }
        @media (max-width: 680px) { .form-row-2col { grid-template-columns: 1fr; } .intake-section-heading { flex-direction: column; } .intake-section-heading p:last-child { text-align: left; } .intake-actions { flex-direction: column-reverse; } .intake-actions button { width: 100%; } }
      `}</style>
    </form>
  )
}
