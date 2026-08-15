'use client'

import { useEffect, useState, useTransition } from 'react'

import { submitInspection } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'
import { ActionFeedback } from '@/components/ui/action-feedback'
import {
  clearSiteInspectionDraft,
  fileToSiteInspectionDraftPhoto,
  loadSiteInspectionDraft,
  saveSiteInspectionDraft,
  siteInspectionDraftPhotoToFile,
  type SiteInspectionDraftFields,
  type SiteInspectionDraftPhoto,
} from '@/lib/operations/site-inspection-draft'

const MAX_PHOTOS = 10
const MAX_PHOTO_BYTES = 15 * 1024 * 1024

interface InspectionDefaults {
  site_address?: string
  floor_area_sqm?: string
  landlord_contact?: string
  as_built_available?: string
  expected_start_date?: string
  scope_notes?: string
}

interface InspectionFormProps {
  opportunityId: string
  pprfSubmitted: boolean
  defaults?: InspectionDefaults
}

function initialFields(defaults?: InspectionDefaults): SiteInspectionDraftFields {
  return {
    site_address: defaults?.site_address ?? '',
    floor_area_sqm: defaults?.floor_area_sqm ?? '',
    landlord_contact: defaults?.landlord_contact ?? '',
    as_built_available: defaults?.as_built_available ?? 'no',
    expected_start_date: defaults?.expected_start_date ?? '',
    weather: '',
    accessibility_notes: '',
    observations: defaults?.scope_notes ?? '',
  }
}

function describeDraftAge(updatedAt: string): string {
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return 'Saved draft restored.'
  return `Saved draft restored from ${date.toLocaleString()}.`
}

export function InspectionForm({ opportunityId, pprfSubmitted, defaults }: InspectionFormProps) {
  const [fields, setFields] = useState<SiteInspectionDraftFields>(() => initialFields(defaults))
  const [photos, setPhotos] = useState<SiteInspectionDraftPhoto[]>([])
  const [uploadedPhotoIds, setUploadedPhotoIds] = useState<string[]>([])
  const [clientSubmissionId, setClientSubmissionId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [draftReady, setDraftReady] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    setDraftReady(false)
    setClientSubmissionId('')
    void loadSiteInspectionDraft(opportunityId).then((draft) => {
      if (!active) return
      if (draft) {
        setFields(draft.fields)
        setPhotos(draft.photos)
        setUploadedPhotoIds(draft.uploadedPhotoIds)
        setClientSubmissionId(draft.clientSubmissionId || crypto.randomUUID())
        setDraftMessage(describeDraftAge(draft.updatedAt))
      } else {
        setClientSubmissionId(crypto.randomUUID())
      }
      setDraftReady(true)
    })
    return () => {
      active = false
    }
  }, [opportunityId])

  useEffect(() => {
    if (typeof navigator !== 'undefined') setOnline(navigator.onLine)
    const handleOnline = () => {
      setOnline(true)
      setDraftMessage('Connection restored. Your saved report is ready to sync.')
    }
    const handleOffline = () => {
      setOnline(false)
      setDraftMessage('Offline. Changes are being saved on this device.')
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!draftReady || !clientSubmissionId) return
    const timer = window.setTimeout(() => {
      void saveSiteInspectionDraft(opportunityId, {
        fields,
        photos,
        uploadedPhotoIds,
        clientSubmissionId,
      })
      setDraftMessage(online ? 'Draft saved on this device.' : 'Saved offline on this device.')
    }, 350)
    return () => window.clearTimeout(timer)
  }, [clientSubmissionId, draftReady, fields, online, opportunityId, photos, uploadedPhotoIds])

  function setField<K extends keyof SiteInspectionDraftFields>(
    field: K,
    value: SiteInspectionDraftFields[K],
  ) {
    setFields((current) => ({ ...current, [field]: value }))
    setError(null)
    setSuccess(null)
  }

  async function addPhotos(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setError(null)
    setPhotoBusy(true)
    try {
      const incoming = Array.from(fileList)
      if (photos.length + incoming.length > MAX_PHOTOS) {
        setError(`You can attach up to ${MAX_PHOTOS} photos per inspection.`)
        return
      }
      const next: SiteInspectionDraftPhoto[] = []
      for (const file of incoming) {
        if (!file.type.startsWith('image/')) {
          setError(`${file.name} is not an image.`)
          continue
        }
        if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
          setError(`${file.name} exceeds the 15 MB photo limit.`)
          continue
        }
        next.push(await fileToSiteInspectionDraftPhoto(file))
      }
      if (next.length > 0) setPhotos((current) => [...current, ...next])
    } catch {
      setError('The photo could not be saved on this device. Try another image.')
    } finally {
      setPhotoBusy(false)
    }
  }

  function removePhoto(id: string) {
    setPhotos((current) => current.filter((photo) => photo.id !== id))
    setError(null)
  }

  async function saveDraftNow() {
    const submissionId = clientSubmissionId || crypto.randomUUID()
    if (!clientSubmissionId) setClientSubmissionId(submissionId)
    await saveSiteInspectionDraft(opportunityId, {
      fields,
      photos,
      uploadedPhotoIds,
      clientSubmissionId: submissionId,
    })
    setDraftMessage(online ? 'Draft saved on this device.' : 'Saved offline on this device.')
  }

  async function uploadPendingPhotos(): Promise<string[]> {
    const documentIds = [...uploadedPhotoIds]
    let draftPhotos = photos
    for (const photo of draftPhotos) {
      if (photo.documentId) {
        if (!documentIds.includes(photo.documentId)) documentIds.push(photo.documentId)
        continue
      }

      const file = await siteInspectionDraftPhotoToFile(photo)
      const body = new FormData()
      body.set('file', file)
      const response = await fetch(`/api/crm/opportunities/${opportunityId}/inspection-photos`, {
        method: 'POST',
        body,
      })
      const result: unknown = await response.json().catch(() => null)
      if (!response.ok || !result || typeof result !== 'object' || !('id' in result)) {
        const message =
          result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
            ? result.error
            : 'Photo upload failed.'
        throw new Error(message)
      }
      const documentId = result.id
      if (typeof documentId !== 'string') throw new Error('Photo upload returned an invalid document.')
      documentIds.push(documentId)
      draftPhotos = draftPhotos.map((currentPhoto) =>
        currentPhoto.id === photo.id ? { ...currentPhoto, documentId } : currentPhoto,
      )
      setPhotos(draftPhotos)
      setUploadedPhotoIds([...documentIds])
      await saveSiteInspectionDraft(opportunityId, {
        fields,
        photos: draftPhotos,
        uploadedPhotoIds: documentIds,
        clientSubmissionId,
      })
    }
    return documentIds
  }

  function onSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    const submissionId = clientSubmissionId || crypto.randomUUID()
    setClientSubmissionId(submissionId)
    formData.set('client_submission_id', submissionId)
    if (!online) {
      void saveDraftNow()
      setDraftMessage('Offline. Report saved; reconnect to sync it.')
      return
    }

    startTransition(async () => {
      try {
        const documentIds = await uploadPendingPhotos()
        formData.set('photo_document_ids', JSON.stringify(documentIds))
        const res = await submitInspection(formData)
        if (res?.error) {
          setError(res.error)
          await saveDraftNow()
        } else if (res?.id) {
          await clearSiteInspectionDraft(opportunityId)
          setSuccess('Site inspection submitted. Design has been notified.')
          setDraftMessage(null)
          setPhotos([])
          setUploadedPhotoIds([])
          setClientSubmissionId(crypto.randomUUID())
          setFields(initialFields(defaults))
        }
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Report sync failed.'
        setError(message)
        await saveDraftNow()
      }
    })
  }

  if (!pprfSubmitted) {
    return <div className="card-empty">Submit a PPRF first before logging a site inspection.</div>
  }

  return (
    <form
      action={onSubmit}
      className="inspection-form"
      aria-busy={pending || photoBusy}
      aria-describedby="inspection-form-status"
    >
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <input type="hidden" name="client_submission_id" value={clientSubmissionId} />

      <div className="form-context" role="note">
        <strong>Mobile field report</strong>
        <span>Prefilled from the submitted PPRF. The report and photos stay attached to this opportunity.</span>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="site_address">Site address *</label>
        <textarea
          id="site_address"
          name="site_address"
          required
          rows={2}
          value={fields.site_address}
          onChange={(event) => setField('site_address', event.target.value)}
          className="form-input"
        />
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="floor_area_sqm">Floor area (sqm)</label>
          <input
            id="floor_area_sqm"
            name="floor_area_sqm"
            type="text"
            className="form-input"
            value={fields.floor_area_sqm}
            onChange={(event) => setField('floor_area_sqm', event.target.value)}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="expected_start_date">Expected start</label>
          <input
            id="expected_start_date"
            name="expected_start_date"
            type="text"
            className="form-input"
            value={fields.expected_start_date}
            onChange={(event) => setField('expected_start_date', event.target.value)}
          />
        </div>
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="landlord_contact">Landlord / site contact</label>
          <input
            id="landlord_contact"
            name="landlord_contact"
            type="text"
            className="form-input"
            value={fields.landlord_contact}
            onChange={(event) => setField('landlord_contact', event.target.value)}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="as_built_available">As-built drawings</label>
          <select
            id="as_built_available"
            name="as_built_available"
            className="form-input"
            value={fields.as_built_available}
            onChange={(event) => setField('as_built_available', event.target.value)}
          >
            <option value="yes">Available</option>
            <option value="partial">Partial</option>
            <option value="no">Not available</option>
          </select>
        </div>
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="weather">Weather</label>
          <input
            id="weather"
            name="weather"
            type="text"
            className="form-input"
            placeholder="Sunny, 31 C"
            value={fields.weather}
            onChange={(event) => setField('weather', event.target.value)}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="accessibility_notes">Accessibility</label>
          <input
            id="accessibility_notes"
            name="accessibility_notes"
            type="text"
            className="form-input"
            placeholder="Service elevator, loading dock"
            value={fields.accessibility_notes}
            onChange={(event) => setField('accessibility_notes', event.target.value)}
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
          value={fields.observations}
          onChange={(event) => setField('observations', event.target.value)}
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="inspection-photos">Photos</label>
        <p className="form-help">Use the camera on a phone or choose images. Up to {MAX_PHOTOS} photos, 15 MB each.</p>
        <input
          id="inspection-photos"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="form-input file-input"
          onChange={(event) => {
            void addPhotos(event.target.files)
            event.currentTarget.value = ''
          }}
          disabled={photoBusy || photos.length >= MAX_PHOTOS}
        />
        {photoBusy && <p className="form-help" role="status">Saving photos on this device...</p>}
        {photos.length > 0 && (
          <ul className="photo-list" aria-label="Inspection photos">
            {photos.map((photo) => (
              <li key={photo.id}>
                <div className="photo-summary">
                  <img src={photo.dataUrl} alt="" className="photo-thumb" />
                  <span>
                    <strong>{photo.name}</strong>
                    <small>{photo.documentId ? 'Uploaded and linked' : 'Saved locally; uploads on sync'}</small>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="link-btn"
                  aria-label={`Remove photo ${photo.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {draftMessage && <p className="form-help" role="status" aria-live="polite">{draftMessage}</p>}
      {!online && <p className="form-warning" role="alert">No connection. Keep working; this report will remain on this device until you sync.</p>}
      <ActionFeedback
        id="inspection-form-status"
        error={error}
        pending={pending || photoBusy}
        pendingMessage={photoBusy ? 'Saving photos on this device…' : 'Syncing inspection…'}
        success={success}
      />

      <div className="form-actions">
        <button type="button" className="secondary-action" onClick={() => void saveDraftNow()}>
          Save draft
        </button>
        <button
          type="submit"
          disabled={pending || photoBusy || !online}
          className="primary-action"
        >
          {pending ? 'Syncing...' : online && uploadedPhotoIds.length + photos.filter((photo) => !photo.documentId).length > 0 ? 'Sync report and photos' : 'Submit inspection'}
        </button>
      </div>

      <style>{`
        .inspection-form { display: flex; flex-direction: column; gap: 14px; }
        .form-context { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-left: 3px solid var(--color-navy-500); background: var(--color-neutral-50); font-size: 13px; color: var(--color-neutral-700); }
        .form-context strong { color: var(--color-navy-800); }
        .form-row { display: flex; flex-direction: column; gap: 6px; }
        .form-row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-row-2col > div { display: flex; flex-direction: column; gap: 6px; }
        .form-label { font-size: 12.5px; font-weight: 500; color: var(--color-neutral-700); }
        .form-help { margin: 0; color: var(--color-neutral-600); font-size: 12px; }
        .form-input { width: 100%; box-sizing: border-box; font-family: inherit; font-size: 14px; padding: 10px 11px; background: white; border: 1px solid var(--color-border); border-radius: var(--radius-sm, 4px); }
        .form-input:focus { outline: 0; border-color: var(--color-navy-500); box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-navy-500) 18%, transparent); }
        .file-input { padding: 9px; }
        .photo-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
        .photo-list li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px; background: var(--color-neutral-50); border-radius: 4px; }
        .photo-summary { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .photo-summary span { display: flex; flex-direction: column; min-width: 0; }
        .photo-summary strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .photo-summary small { color: var(--color-neutral-600); font-size: 11px; }
        .photo-thumb { width: 42px; height: 42px; border-radius: 4px; object-fit: cover; background: var(--color-neutral-200); }
        .link-btn { flex: 0 0 auto; background: none; border: 0; color: var(--color-danger); cursor: pointer; font-size: 12px; padding: 8px 4px; }
        .form-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .primary-action, .secondary-action { min-height: 44px; border-radius: var(--radius-sm, 4px); padding: 10px 14px; font: inherit; font-weight: 600; cursor: pointer; }
        .primary-action { border: 1px solid var(--color-navy-700); background: var(--color-navy-700); color: white; }
        .secondary-action { border: 1px solid var(--color-border); background: white; color: var(--color-navy-800); }
        .primary-action:disabled { cursor: wait; opacity: .6; }
        .form-error, .form-warning, .form-success { font-size: 13px; }
        .form-error { color: var(--color-danger); }
        .form-warning { color: #92400e; }
        .form-success { color: var(--color-success, #15803d); }
        @media (max-width: 640px) {
          .form-row-2col { grid-template-columns: 1fr; gap: 14px; }
          .form-actions { flex-direction: column-reverse; }
          .primary-action, .secondary-action { width: 100%; }
          .photo-list li { align-items: flex-start; }
        }
      `}</style>
    </form>
  )
}
