export interface SiteInspectionDraftFields {
  site_address: string
  floor_area_sqm: string
  landlord_contact: string
  as_built_available: string
  expected_start_date: string
  weather: string
  accessibility_notes: string
  observations: string
}

export interface SiteInspectionDraftPhoto {
  id: string
  name: string
  type: string
  size: number
  lastModified: number
  dataUrl: string
  documentId?: string
}

export interface SiteInspectionDraft {
  fields: SiteInspectionDraftFields
  photos: SiteInspectionDraftPhoto[]
  uploadedPhotoIds: string[]
  clientSubmissionId: string
  updatedAt: string
}

const DB_NAME = 'abi-ops-site-inspection'
const STORE_NAME = 'drafts'

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
  })
}

export async function loadSiteInspectionDraft(
  opportunityId: string,
): Promise<SiteInspectionDraft | null> {
  if (!canUseIndexedDb()) return null
  try {
    const db = await openDraftDb()
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(opportunityId)
      request.onsuccess = () => resolve((request.result as SiteInspectionDraft | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error('Draft read failed'))
    })
  } catch {
    return null
  }
}

export async function saveSiteInspectionDraft(
  opportunityId: string,
  draft: Omit<SiteInspectionDraft, 'updatedAt'>,
): Promise<void> {
  if (!canUseIndexedDb()) return
  try {
    const db = await openDraftDb()
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .put({ ...draft, updatedAt: new Date().toISOString() }, opportunityId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error('Draft write failed'))
    })
  } catch {
    // Draft persistence is best-effort. The form remains usable when browser
    // storage is disabled or full.
  }
}

export async function clearSiteInspectionDraft(opportunityId: string): Promise<void> {
  if (!canUseIndexedDb()) return
  try {
    const db = await openDraftDb()
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .delete(opportunityId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error('Draft delete failed'))
    })
  } catch {
    // A stale draft is safer than losing a field report; leave it recoverable.
  }
}

export async function fileToSiteInspectionDraftPhoto(
  file: File,
): Promise<SiteInspectionDraftPhoto> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Photo read failed'))
    reader.readAsDataURL(file)
  })
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    dataUrl,
  }
}

export async function siteInspectionDraftPhotoToFile(
  photo: SiteInspectionDraftPhoto,
): Promise<File> {
  const response = await fetch(photo.dataUrl)
  const blob = await response.blob()
  return new File([blob], photo.name, {
    type: photo.type,
    lastModified: photo.lastModified,
  })
}
