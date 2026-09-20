'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { z } from 'zod'

import { submitInspection } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'
import { ActionFeedback } from '@/components/ui/action-feedback'
import { uploadInspectionPhoto } from '@/lib/inspection-photo-upload'
import {
  clearSiteInspectionDraft,
  fileToSiteInspectionDraftPhoto,
  loadSiteInspectionDraft,
  saveSiteInspectionDraft,
  siteInspectionDraftPhotoToFile,
  siteInspectionDraftScopeKey,
  SiteInspectionDraftStorageError,
  type SiteInspectionDraft,
  type SiteInspectionDraftFields,
  type SiteInspectionDraftPhoto,
} from '@/lib/operations/site-inspection-draft'

const MAX_PHOTOS = 10
const MAX_PHOTO_BYTES = 15 * 1024 * 1024
const confirmationSchema = z.object({
  actorId: z.string().uuid(), tenantId: z.string().uuid(),
  opportunityId: z.string().uuid(), submissionId: z.string().uuid(),
})

interface InspectionDefaults {
  site_address?: string
  floor_area_sqm?: string
  landlord_contact?: string
  as_built_available?: string
  expected_start_date?: string
  scope_notes?: string
}

interface InspectionFormProps {
  actorId: string
  tenantId: string
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

export function InspectionForm(props: InspectionFormProps) {
  // Reset all in-memory fields before a different identity can render them.
  const { actorId, tenantId, opportunityId } = props
  return <InspectionFormSession key={siteInspectionDraftScopeKey({ actorId, tenantId, opportunityId })} {...props} />
}

function InspectionFormSession({ actorId, tenantId, opportunityId, pprfSubmitted, defaults }: InspectionFormProps) {
  const scope = useMemo(() => ({ actorId, tenantId, opportunityId }), [actorId, tenantId, opportunityId])
  const [fields, setFields] = useState<SiteInspectionDraftFields>(() => initialFields(defaults))
  const [photos, setPhotos] = useState<SiteInspectionDraftPhoto[]>([])
  const [uploadedPhotoIds, setUploadedPhotoIds] = useState<string[]>([])
  const [clientSubmissionId, setClientSubmissionId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [archiveWarning, setArchiveWarning] = useState<string | null>(null)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [draftReady, setDraftReady] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [submissionPending, setSubmissionPending] = useState(false)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const [memoryOnly, setMemoryOnly] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [pending, startTransition] = useTransition()
  const inFlightRef = useRef(false)
  const revisionRef = useRef(0)
  const editVersionRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const lifetimeRef = useRef(0)
  const clearingRef = useRef(false)

  useLayoutEffect(() => {
    lifetimeRef.current += 1
    return () => { lifetimeRef.current += 1 }
  }, [])

  function requireCurrentSession(lifetime: number) {
    if (lifetimeRef.current !== lifetime) throw new Error('Inspection session changed. Return to the original account to resume its saved draft.')
  }

  const persistDraft = useCallback((draft: Omit<SiteInspectionDraft, 'updatedAt'>) => {
    if (memoryOnly) return Promise.resolve()
    // Preserve local write order; the store's revision also fences other tabs.
    const save = saveQueueRef.current.then(async () => {
      revisionRef.current = await saveSiteInspectionDraft(scope, draft, revisionRef.current)
    })
    saveQueueRef.current = save.then(() => {}, () => {})
    return save
  }, [scope, memoryOnly])

  useEffect(() => {
    let active = true
    setDraftReady(false)
    setClientSubmissionId('')
    setDraftError(null)
    setStorageUnavailable(false)
    void loadSiteInspectionDraft(scope).then(({ draft, revision }) => {
      if (!active) return
      revisionRef.current = revision
      if (draft) {
        setFields(draft.fields)
        setPhotos(draft.photos)
        setUploadedPhotoIds(draft.uploadedPhotoIds)
        setSubmissionPending(draft.submissionPending === true)
        setClientSubmissionId(draft.clientSubmissionId || crypto.randomUUID())
        setDraftMessage(describeDraftAge(draft.updatedAt))
      } else {
        setClientSubmissionId(crypto.randomUUID())
      }
      setDraftReady(true)
    }).catch((loadError: unknown) => {
      if (!active) return
      setStorageUnavailable(loadError instanceof SiteInspectionDraftStorageError && loadError.code === 'UNAVAILABLE')
      setDraftError('The saved inspection draft could not be loaded. Check browser storage and retry; existing device evidence was not overwritten.')
    })
    return () => {
      active = false
    }
  }, [scope, loadAttempt])

  useEffect(() => {
    if (typeof navigator !== 'undefined') setOnline(navigator.onLine)
    const handleOnline = () => {
      setOnline(true)
    }
    const handleOffline = () => {
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!memoryOnly) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [memoryOnly])

  useEffect(() => {
    if (!draftReady || !clientSubmissionId || pending || submitted || submissionPending || photoBusy || memoryOnly) return
    let active = true
    const version = editVersionRef.current
    const timer = window.setTimeout(() => {
      void persistDraft({
        fields,
        photos,
        uploadedPhotoIds,
        clientSubmissionId,
      }).then(() => {
        if (!active || version !== editVersionRef.current) return
        setDraftError(null)
        setDraftMessage(online ? 'Draft saved on this device.' : 'Saved offline on this device.')
      }).catch(() => {
        if (!active) return
        setDraftMessage(null)
        setDraftError('Changes could not be saved on this device. Keep this page open. Check browser storage, or reload if the draft changed in another tab.')
      })
    }, 350)
    return () => { active = false; window.clearTimeout(timer) }
  }, [clientSubmissionId, draftReady, fields, online, persistDraft, photos, uploadedPhotoIds, pending, submitted, submissionPending, photoBusy, memoryOnly])

  function setField<K extends keyof SiteInspectionDraftFields>(
    field: K,
    value: SiteInspectionDraftFields[K],
  ) {
    editVersionRef.current += 1
    setDraftMessage(null)
    setFields((current) => ({ ...current, [field]: value }))
    setError(null)
    setSuccess(null)
    setArchiveWarning(null)
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
          setError(`${file.name} exceeds the 15 MiB photo limit.`)
          continue
        }
        next.push(await fileToSiteInspectionDraftPhoto(file))
      }
      if (next.length > 0) {
        editVersionRef.current += 1
        setDraftMessage(null)
        setPhotos((current) => [...current, ...next])
      }
    } catch {
      setError('The photo could not be saved on this device. Try another image.')
    } finally {
      setPhotoBusy(false)
    }
  }

  function removePhoto(id: string) {
    const removed = photos.find((photo) => photo.id === id)
    const remaining = photos.filter((photo) => photo.id !== id)
    setPhotos(remaining)
    if (removed?.documentId && !remaining.some((photo) => photo.documentId === removed.documentId)) {
      setUploadedPhotoIds((ids) => ids.filter((documentId) => documentId !== removed.documentId))
    }
    editVersionRef.current += 1
    setDraftMessage(null)
    setError(null)
  }

  async function saveDraftNow() {
    if (!draftReady || inFlightRef.current || submitted || submissionPending || memoryOnly) return
    const submissionId = clientSubmissionId || crypto.randomUUID()
    if (!clientSubmissionId) setClientSubmissionId(submissionId)
    const version = editVersionRef.current
    try {
      await persistDraft({ fields, photos, uploadedPhotoIds, clientSubmissionId: submissionId })
      if (version === editVersionRef.current) {
        setDraftError(null)
        setDraftMessage(online ? 'Draft saved on this device.' : 'Saved offline on this device.')
      }
    } catch {
      setDraftMessage(null)
      setDraftError('Changes could not be saved on this device. Keep this page open. Check browser storage, or reload if the draft changed in another tab.')
    }
  }

  async function uploadPendingPhotos(lifetime: number): Promise<{ documentIds: string[]; draftPhotos: SiteInspectionDraftPhoto[] }> {
    const documentIds = [...uploadedPhotoIds]
    let draftPhotos = photos
    for (const photo of draftPhotos) {
      if (photo.documentId) {
        if (!documentIds.includes(photo.documentId)) documentIds.push(photo.documentId)
        continue
      }

      const file = await siteInspectionDraftPhotoToFile(photo)
      requireCurrentSession(lifetime)
      const documentId = await uploadInspectionPhoto(file, scope, () => requireCurrentSession(lifetime))
      requireCurrentSession(lifetime)
      if (!documentIds.includes(documentId)) documentIds.push(documentId)
      draftPhotos = draftPhotos.map((currentPhoto) =>
        currentPhoto.id === photo.id ? { ...currentPhoto, documentId } : currentPhoto,
      )
      setPhotos(draftPhotos)
      setUploadedPhotoIds([...documentIds])
      await persistDraft({
        fields,
        photos: draftPhotos,
        uploadedPhotoIds: documentIds,
        clientSubmissionId,
      })
      requireCurrentSession(lifetime)
    }
    return { documentIds, draftPhotos }
  }

  function onSubmit(formData: FormData) {
    if (inFlightRef.current) return
    if (!draftReady || submitted || photoBusy) return
    inFlightRef.current = true
    setError(null)
    setSuccess(null)
    setArchiveWarning(null)
    const submissionId = clientSubmissionId || crypto.randomUUID()
    const lifetime = lifetimeRef.current
    setClientSubmissionId(submissionId)
    // Disabled controls are omitted by native FormData during exact retries.
    for (const [name, value] of Object.entries(fields)) formData.set(name, value)
    formData.set('client_submission_id', submissionId)
    if (!online) {
      inFlightRef.current = false
      void saveDraftNow()
      return
    }

    startTransition(async () => {
      try {
        // Durable mode persists before effects; explicit online-only mode keeps
        // the same command in memory and never claims reload recovery.
        await persistDraft({ fields, photos, uploadedPhotoIds, clientSubmissionId: submissionId, submissionPending })
        requireCurrentSession(lifetime)
        const { documentIds, draftPhotos } = submissionPending
          ? { documentIds: uploadedPhotoIds, draftPhotos: photos }
          : await uploadPendingPhotos(lifetime)
        requireCurrentSession(lifetime)
        const command = { fields, photos: draftPhotos, uploadedPhotoIds: documentIds, clientSubmissionId: submissionId, submissionPending: true }
        await persistDraft(command)
        requireCurrentSession(lifetime)
        setSubmissionPending(true)
        formData.set('photo_document_ids', JSON.stringify(documentIds))
        const res = await submitInspection(opportunityId, formData, { actorId, tenantId })
        requireCurrentSession(lifetime)
        if (!res.ok) {
          setError(res.error)
          // A rejected retry does not settle an earlier unknown dispatch.
          if (res.outcome === 'rejected' && !submissionPending) {
            await persistDraft({ ...command, submissionPending: false })
            requireCurrentSession(lifetime)
            setSubmissionPending(false)
          }
        } else {
          const checked = confirmationSchema.safeParse('confirmation' in res ? res.confirmation : null)
          if (!checked.success || Object.entries({ actorId, tenantId, opportunityId, submissionId }).some(([key, value]) => checked.data[key as keyof typeof checked.data].toLowerCase() !== value.toLowerCase())) {
            throw new Error('The inspection acknowledgement did not match this saved report. Retry the unchanged report to confirm its outcome.')
          }
          setSubmitted(true)
          setSuccess(
            res.replayed
              ? 'This inspection was already submitted. The existing Design handoff was recovered.'
              : 'Site inspection submitted. The Design handoff was recorded.',
          )
          setArchiveWarning(res.archiveWarning ?? null)
          await finishClearingDraft()
        }
      } catch (submitError) {
        if (lifetimeRef.current !== lifetime) return
        const message = submitError instanceof Error ? submitError.message : 'Report sync failed.'
        setError(message)
        // Initial payload and each confirmed receipt were persisted in order.
        // Re-saving this render's older snapshot would erase upload receipts.
      } finally {
        inFlightRef.current = false
      }
    })
  }

  async function finishClearingDraft() {
    if (clearingRef.current) return
    clearingRef.current = true
    try {
      await saveQueueRef.current
      if (!memoryOnly) revisionRef.current = await clearSiteInspectionDraft(scope, revisionRef.current)
      setDraftMessage(null)
      setDraftError(null)
      setPhotos([])
      setUploadedPhotoIds([])
      setClientSubmissionId(crypto.randomUUID())
      setFields(initialFields(defaults))
      setSubmitted(false)
      setSubmissionPending(false)
    } catch {
      setDraftMessage(null)
      setDraftError('Inspection submitted, but the saved device draft could not be cleared. Your evidence was retained; retry clearing it before starting another report.')
    } finally {
      clearingRef.current = false
    }
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
      <input type="hidden" name="client_submission_id" value={clientSubmissionId} />
      <input type="hidden" name="photo_document_ids" value={JSON.stringify(uploadedPhotoIds)} />

      <fieldset className="inspection-fields" disabled={!draftReady || pending || photoBusy || submitted || submissionPending}>

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
        <p className="form-help">Use the camera on a phone or choose images. Up to {MAX_PHOTOS} photos, 15 MiB each.</p>
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
                  {/* Device-local data URLs cannot be sent through Next's image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.dataUrl} alt="" className="photo-thumb" />
                  <span>
                    <strong>{photo.name}</strong>
                    <small>{photo.documentId ? 'Uploaded; attaches when report syncs' : 'Selected on this device; uploads on sync'}</small>
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

      </fieldset>

      {draftMessage && <p className="form-help" role="status" aria-live="polite">{draftMessage}</p>}
      {draftError && <p className="form-warning" role="alert">{draftError}</p>}
      {memoryOnly && <p className="form-warning" role="alert">Online-only report: not saved on this device. Reloading or leaving will lose this report and its photos. Keep this page open until submission is confirmed.</p>}
      {submissionPending && !submitted && <p className="form-warning" role="alert">Report submission is not yet confirmed. Its exact contents are {memoryOnly ? 'retained in this page' : 'saved'} and locked. Retry the unchanged report to recover the result.</p>}
      {!online && <p className="form-warning" role="alert">No connection. Check the draft save status before leaving this page; reconnect to sync.</p>}
      <ActionFeedback
        id="inspection-form-status"
        error={error}
        pending={pending || photoBusy}
        pendingMessage={photoBusy ? 'Saving photos on this device…' : 'Syncing inspection…'}
        success={success}
      />
      {archiveWarning && (
        <p className="form-warning" role="alert">{archiveWarning}</p>
      )}

      <div className="form-actions">
        {!draftReady && draftError && <button type="button" className="secondary-action" onClick={() => setLoadAttempt((value) => value + 1)}>Retry loading draft</button>}
        {!draftReady && storageUnavailable && online && <button type="button" className="secondary-action" onClick={() => {
          setMemoryOnly(true)
          setDraftError(null)
          setDraftMessage(null)
          setClientSubmissionId(crypto.randomUUID())
          setDraftReady(true)
        }}>Continue online without a saved draft</button>}
        {submitted && <button type="button" className="secondary-action" disabled={pending} onClick={() => void finishClearingDraft()}>Finish clearing saved draft</button>}
        <button type="button" className="secondary-action" disabled={!draftReady || pending || photoBusy || submitted || submissionPending || memoryOnly} onClick={() => void saveDraftNow()}>
          Save draft
        </button>
        <button
          type="submit"
          disabled={pending || photoBusy || !online || !draftReady || submitted}
          className="primary-action"
        >
          {!draftReady ? 'Preparing…' : pending ? 'Syncing...' : submissionPending ? 'Retry report sync' : online && uploadedPhotoIds.length + photos.filter((photo) => !photo.documentId).length > 0 ? 'Sync report and photos' : 'Submit inspection'}
        </button>
      </div>

      <style>{`
        .inspection-form { display: flex; flex-direction: column; gap: 14px; }
        .inspection-fields { display: flex; flex-direction: column; gap: 14px; min-width: 0; padding: 0; margin: 0; border: 0; }
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
