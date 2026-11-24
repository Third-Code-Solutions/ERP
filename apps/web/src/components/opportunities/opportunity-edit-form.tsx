'use client'

import React, { useState, useTransition } from 'react'
import { updateOpportunity } from '@/app/(dashboard)/crm/opportunities/[id]/actions'

export interface OpportunityEditValues {
  tcv: string
  gp: string
  closingDate: string
  areaSqm: string
  opportunityType: string
  remarks: string
  repId: string
}

interface OpportunityEditFormProps {
  opportunityId: string
  values: OpportunityEditValues
  typeOptions: ReadonlyArray<{ value: string; label: string }>
  reps: ReadonlyArray<{ id: string; name: string }>
  /** Projects that can still be linked; null when the opportunity is already linked. */
  linkableProjects: ReadonlyArray<{ id: string; name: string }> | null
}

const fieldStyle = {
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '7px 9px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  background: 'var(--color-surface)',
} as const

const labelStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-neutral-700)',
} as const

export function OpportunityEditForm({
  opportunityId,
  values,
  typeOptions,
  reps,
  linkableProjects,
}: OpportunityEditFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await updateOpportunity(formData)
        if (result.error) setError(result.error)
        else setNotice(result.saved ? 'Opportunity saved.' : 'No changes to save.')
      } catch {
        setError('The opportunity could not be saved. Refresh the page and try again.')
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-describedby="opportunity-edit-status"
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <input type="hidden" name="opportunity_id" value={opportunityId} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Field id="opportunity-edit-tcv" label="TCV (₱)">
          <input
            id="opportunity-edit-tcv"
            name="tcv"
            type="text"
            inputMode="decimal"
            defaultValue={values.tcv}
            style={fieldStyle}
          />
        </Field>
        <Field id="opportunity-edit-gp" label="Expected GP (₱)">
          <input
            id="opportunity-edit-gp"
            name="gp"
            type="text"
            inputMode="decimal"
            defaultValue={values.gp}
            style={fieldStyle}
          />
        </Field>
        <Field id="opportunity-edit-closing" label="Est. closing date">
          <input
            id="opportunity-edit-closing"
            name="closing_date"
            type="date"
            defaultValue={values.closingDate}
            style={fieldStyle}
          />
        </Field>
        <Field id="opportunity-edit-area" label="Area (sqm)">
          <input
            id="opportunity-edit-area"
            name="area_sqm"
            type="number"
            min="1"
            step="1"
            defaultValue={values.areaSqm}
            style={fieldStyle}
          />
        </Field>
        <Field id="opportunity-edit-type" label="Type">
          <select
            id="opportunity-edit-type"
            name="opportunity_type"
            defaultValue={values.opportunityType}
            style={fieldStyle}
          >
            <option value="">—</option>
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="opportunity-edit-rep" label="Sales owner">
          <select
            id="opportunity-edit-rep"
            name="rep_id"
            defaultValue={values.repId}
            style={fieldStyle}
          >
            {values.repId === '' && <option value="">Unassigned</option>}
            {reps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.name}
              </option>
            ))}
          </select>
        </Field>
        {linkableProjects && (
          <Field id="opportunity-edit-project" label="Link a project (once)">
            <select
              id="opportunity-edit-project"
              name="project_id"
              defaultValue=""
              aria-describedby="opportunity-edit-project-help"
              style={fieldStyle}
            >
              <option value="">Not linked</option>
              {linkableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <span id="opportunity-edit-project-help" style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
              Once linked, the project cannot be changed. Its documents become available to the Design step.
            </span>
          </Field>
        )}
      </div>

      <Field id="opportunity-edit-remarks" label="Remarks">
        <textarea
          id="opportunity-edit-remarks"
          name="remarks"
          rows={3}
          defaultValue={values.remarks}
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
      </Field>

      <p id="opportunity-edit-status" role="status" aria-live="polite" style={{ margin: 0, fontSize: 12 }}>
        {error ? (
          <span role="alert" style={{ color: 'var(--color-danger)' }}>
            {error}
          </span>
        ) : (
          notice && <span style={{ color: 'var(--color-success, #15803d)' }}>{notice}</span>
        )}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="user-chip"
        style={{
          alignSelf: 'flex-start',
          cursor: pending ? 'wait' : 'pointer',
          background: 'var(--color-navy-700)',
          color: 'white',
          borderColor: 'var(--color-navy-700)',
        }}
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {children}
    </div>
  )
}
