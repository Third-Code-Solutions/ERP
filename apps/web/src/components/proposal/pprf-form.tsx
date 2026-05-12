'use client'

import { useRef, useState, useTransition } from 'react'
import { submitPprf } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

interface PprfFormProps {
  opportunityId: string
  defaults: {
    site_address: string
    floor_area_sqm: string
    landlord_contact: string
    as_built_available: 'yes' | 'no' | 'partial'
    scope_notes: string
    project_type: string
    expected_start_date: string
    budget_range: string
  }
}

export function PprfForm({ opportunityId, defaults }: PprfFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await submitPprf(formData)
      if (res?.error) {
        setError(res.error)
      } else if (res?.version) {
        setSuccess(`PPRF v${res.version} submitted.`)
      }
    })
  }

  return (
    <form action={onSubmit} ref={formRef} className="pprf-form">
      <input type="hidden" name="opportunity_id" value={opportunityId} />

      <div className="form-row">
        <label className="form-label" htmlFor="site_address">Site address *</label>
        <textarea
          id="site_address"
          name="site_address"
          required
          minLength={2}
          rows={2}
          defaultValue={defaults.site_address}
          className="form-input"
          placeholder="Floor, Building, Street, City…"
        />
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="floor_area_sqm">Floor area (sqm) *</label>
          <input
            id="floor_area_sqm"
            name="floor_area_sqm"
            type="number"
            min={1}
            step="0.01"
            required
            defaultValue={defaults.floor_area_sqm}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="landlord_contact">Landlord contact *</label>
          <input
            id="landlord_contact"
            name="landlord_contact"
            type="text"
            required
            defaultValue={defaults.landlord_contact}
            className="form-input"
            placeholder="Name and phone / email"
          />
        </div>
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="as_built_available">As-built available *</label>
          <select
            id="as_built_available"
            name="as_built_available"
            required
            defaultValue={defaults.as_built_available}
            className="form-input"
          >
            <option value="yes">Yes</option>
            <option value="partial">Partial</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="project_type">Project type</label>
          <input
            id="project_type"
            name="project_type"
            type="text"
            defaultValue={defaults.project_type}
            className="form-input"
            placeholder="Retail fit-out, office build, …"
          />
        </div>
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="expected_start_date">Expected start date</label>
          <input
            id="expected_start_date"
            name="expected_start_date"
            type="date"
            defaultValue={defaults.expected_start_date}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="budget_range">Budget range</label>
          <input
            id="budget_range"
            name="budget_range"
            type="text"
            defaultValue={defaults.budget_range}
            className="form-input"
            placeholder="₱5M – ₱8M"
          />
        </div>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="scope_notes">Scope notes</label>
        <textarea
          id="scope_notes"
          name="scope_notes"
          rows={6}
          defaultValue={defaults.scope_notes}
          className="form-input"
          placeholder="Anything Commercial needs to know before the site survey."
        />
      </div>

      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{success}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="submit"
          disabled={pending}
          className="user-chip"
          style={{
            borderColor: 'var(--color-navy-700)',
            background: 'var(--color-navy-700)',
            color: 'white',
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          <span style={{ fontWeight: 600 }}>{pending ? 'Submitting…' : 'Submit new PPRF version'}</span>
        </button>
      </div>

      <style>{`
        .pprf-form { display: flex; flex-direction: column; gap: 14px; }
        .form-row { display: flex; flex-direction: column; gap: 6px; }
        .form-row-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .form-row-2col > div { display: flex; flex-direction: column; gap: 6px; }
        .form-label { font-size: 12.5px; font-weight: 500; color: var(--color-neutral-700); }
        .form-input {
          font-family: inherit;
          font-size: 14px;
          padding: 8px 10px;
          background: white;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm, 4px);
          color: var(--color-neutral-900);
        }
        .form-input:focus {
          outline: 0;
          border-color: var(--color-navy-500);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-navy-500) 18%, transparent);
        }
        .form-error { color: var(--color-danger); font-size: 13px; }
        .form-success { color: var(--color-success, #15803d); font-size: 13px; }
      `}</style>
    </form>
  )
}
