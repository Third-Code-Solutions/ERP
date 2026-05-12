'use client'

import { useState, useTransition } from 'react'
import { submitInspection } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

interface InspectionFormProps {
  opportunityId: string
  pprfSubmitted: boolean
  defaults?: {
    site_address?: string
  }
}

export function InspectionForm({ opportunityId, pprfSubmitted, defaults }: InspectionFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [photoIds, setPhotoIds] = useState<string[]>([])
  const [photoInput, setPhotoInput] = useState('')

  function addPhotoId() {
    const trimmed = photoInput.trim()
    if (!trimmed) return
    if (photoIds.includes(trimmed)) return
    setPhotoIds([...photoIds, trimmed])
    setPhotoInput('')
  }

  function removePhotoId(id: string) {
    setPhotoIds(photoIds.filter((p) => p !== id))
  }

  function onSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    formData.set('photo_document_ids', JSON.stringify(photoIds))
    startTransition(async () => {
      const res = await submitInspection(formData)
      if (res?.error) {
        setError(res.error)
      } else if (res?.id) {
        setSuccess('Site inspection submitted. Design has been notified.')
        setPhotoIds([])
      }
    })
  }

  if (!pprfSubmitted) {
    return (
      <div className="card-empty">
        Submit a PPRF first before logging a site inspection.
      </div>
    )
  }

  return (
    <form action={onSubmit} className="inspection-form">
      <input type="hidden" name="opportunity_id" value={opportunityId} />

      <div className="form-row">
        <label className="form-label" htmlFor="site_address">Site address *</label>
        <textarea
          id="site_address"
          name="site_address"
          required
          rows={2}
          defaultValue={defaults?.site_address ?? ''}
          className="form-input"
        />
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="weather">Weather</label>
          <input
            id="weather"
            name="weather"
            type="text"
            className="form-input"
            placeholder="Sunny, 31°C"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="accessibility_notes">Accessibility</label>
          <input
            id="accessibility_notes"
            name="accessibility_notes"
            type="text"
            className="form-input"
            placeholder="Service elevator, loading dock, …"
          />
        </div>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="observations">Observations</label>
        <textarea
          id="observations"
          name="observations"
          rows={5}
          className="form-input"
          placeholder="Existing conditions, scope concerns, anything Design should know."
        />
      </div>

      <div className="form-row">
        <label className="form-label">Photos (document IDs)</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={photoInput}
            onChange={(e) => setPhotoInput(e.target.value)}
            placeholder="Existing document UUID"
            className="form-input"
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addPhotoId()
              }
            }}
          />
          <button
            type="button"
            className="user-chip"
            onClick={addPhotoId}
            style={{ cursor: 'pointer' }}
          >
            Add
          </button>
        </div>
        {photoIds.length > 0 && (
          <ul className="photo-list">
            {photoIds.map((id) => (
              <li key={id}>
                <span style={{ fontFamily: 'var(--font-mono, ui-monospace)', fontSize: 12 }}>{id}</span>
                <button
                  type="button"
                  onClick={() => removePhotoId(id)}
                  className="link-btn"
                  aria-label={`Remove photo ${id}`}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{success}</p>}

      <div>
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
          <span style={{ fontWeight: 600 }}>{pending ? 'Submitting…' : 'Submit inspection'}</span>
        </button>
      </div>

      <style>{`
        .inspection-form { display: flex; flex-direction: column; gap: 14px; }
        .form-row { display: flex; flex-direction: column; gap: 6px; }
        .form-row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-row-2col > div { display: flex; flex-direction: column; gap: 6px; }
        .form-label { font-size: 12.5px; font-weight: 500; color: var(--color-neutral-700); }
        .form-input {
          font-family: inherit;
          font-size: 14px;
          padding: 8px 10px;
          background: white;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm, 4px);
        }
        .form-input:focus {
          outline: 0;
          border-color: var(--color-navy-500);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-navy-500) 18%, transparent);
        }
        .photo-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .photo-list li {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 8px; background: var(--color-neutral-50); border-radius: 4px;
        }
        .link-btn {
          background: none; border: 0; color: var(--color-danger);
          cursor: pointer; font-size: 12px; padding: 0;
        }
        .form-error { color: var(--color-danger); font-size: 13px; }
        .form-success { color: var(--color-success, #15803d); font-size: 13px; }
      `}</style>
    </form>
  )
}
