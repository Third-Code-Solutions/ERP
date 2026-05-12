'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@buildops/auth/client'

export interface CadUploadResult {
  status:
    | 'extracted'
    | 'binary-dwg-pending'
    | 'unknown-format'
    | 'download-failed'
    | 'no-items'
    | 'ai-not-configured'
    | 'too-large'
    | 'parse-failed'
    | 'error'
  scopeItemsCreated: number
  warnings: string[]
  layerCount: number
  entityCount: number
  detectedFormat: 'dxf' | 'dwg' | 'pdf' | 'image' | 'spreadsheet' | 'csv' | 'docx' | 'unknown'
  dwgVersion: string | null
  extensionMismatch: boolean
  message: string
  bomId: string | null
  bomTcvCents: number
  bomCostCents: number
  bomGpMarginBps: number
  ragMatches: number
}

export interface CompleteResponse {
  id: string
  storagePath: string
  documentType: string
  cadFormat: 'dxf' | 'dwg' | null
  cadParseQueued?: boolean
  cadParseWarning?: string
  cadResult?: CadUploadResult
}

interface SignResponse {
  signedUrl: string
  token: string
  storagePath: string
}

export const MAX_CAD_SIZE_BYTES = 100 * 1024 * 1024
// Every format the BOM intake supports. CAD goes through the DXF/DWG parser;
// everything else goes through the AI-vision scope extractor.
export const CAD_ACCEPT =
  '.dxf,.dwg,.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.xlsx,.xls,.csv,.docx,.doc'

async function signUpload(
  projectId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number
): Promise<SignResponse> {
  const res = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, fileName, mimeType, sizeBytes }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Failed to obtain upload URL (${res.status})`)
  }
  return res.json()
}

async function notifyComplete(args: {
  storagePath: string
  projectId: string
  fileName: string
  mimeType: string
  sizeBytes: number
}): Promise<CompleteResponse> {
  const res = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Failed to record upload (${res.status})`)
  }
  return res.json()
}

export type UploadPhase =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'finalizing'
  | 'done'
  | 'error'

export interface UseCadUploadOptions {
  projectId: string
  /** Called once after the document row is recorded. */
  onComplete?: (result: CompleteResponse) => void
  /** Whether to call router.refresh() on success. Defaults to true. */
  refreshOnComplete?: boolean
}

export interface UseCadUploadResult {
  /** Currently uploading? */
  isPending: boolean
  /** Where in the flow we are. */
  phase: UploadPhase
  /** Human-readable progress message — safe to render. */
  progress: string
  /** Last error message — empty string when none. */
  error: string
  /** Full server response from /api/upload/complete on the most recent success. */
  lastResult: CompleteResponse | null
  /** Kick off an upload for one file. */
  upload: (file: File) => void
  /** Reset error/progress without clearing the last result. */
  reset: () => void
}

export function useCadUpload({
  projectId,
  onComplete,
  refreshOnComplete = true,
}: UseCadUploadOptions): UseCadUploadResult {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState<CompleteResponse | null>(null)

  const reset = useCallback(() => {
    setPhase('idle')
    setProgress('')
    setError('')
  }, [])

  const upload = useCallback(
    (file: File) => {
      if (file.size > MAX_CAD_SIZE_BYTES) {
        setPhase('error')
        setError(
          `File exceeds 100 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
        )
        setProgress('')
        return
      }

      setError('')
      setProgress('')

      startTransition(async () => {
        try {
          setPhase('preparing')
          setProgress('Preparing upload…')
          const signed = await signUpload(
            projectId,
            file.name,
            file.type || 'application/octet-stream',
            file.size
          )

          setPhase('uploading')
          setProgress(`Uploading ${(file.size / (1024 * 1024)).toFixed(1)} MB to storage…`)
          const supabase = createSupabaseBrowserClient()
          const { error: storageError } = await supabase.storage
            .from('documents')
            .uploadToSignedUrl(signed.storagePath, signed.token, file, {
              contentType: file.type || 'application/octet-stream',
              upsert: false,
            })
          if (storageError) {
            throw new Error(`Storage upload failed: ${storageError.message}`)
          }

          setPhase('finalizing')
          setProgress('Finalizing…')
          const completed = await notifyComplete({
            storagePath: signed.storagePath,
            projectId,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
          })

          setLastResult(completed)
          setPhase('done')
          setProgress(formatCompletionProgress(completed))
          // cadParseWarning indicates a hard infrastructure failure (DB write
          // succeeded but a side effect crashed). The friendly "worker pending"
          // state is not an error — it's an expected status and the message is
          // already in cadResult.message via formatCompletionProgress.
          if (
            completed.cadParseWarning &&
            completed.cadResult?.status !== 'binary-dwg-pending'
          ) {
            setError(completed.cadParseWarning)
          }

          onComplete?.(completed)
          if (refreshOnComplete) router.refresh()
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed'
          setError(message)
          setPhase('error')
          setProgress('')
        }
      })
    },
    [projectId, onComplete, refreshOnComplete, router]
  )

  return { isPending, phase, progress, error, lastResult, upload, reset }
}

function formatCompactPhp(cents: number): string {
  if (cents === 0) return '₱0'
  const value = cents / 100
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(0)}k`
  return `₱${value.toFixed(0)}`
}

function fmtLabel(detected: CadUploadResult['detectedFormat']): string {
  switch (detected) {
    case 'dwg':
      return 'DWG'
    case 'pdf':
      return 'PDF'
    case 'image':
      return 'Image'
    case 'spreadsheet':
      return 'Spreadsheet'
    case 'csv':
      return 'CSV'
    case 'docx':
      return 'Word doc'
    case 'dxf':
    default:
      return 'DXF'
  }
}

export function formatCompletionProgress(completed: CompleteResponse): string {
  if (completed.cadResult) {
    const r = completed.cadResult
    const label = fmtLabel(r.detectedFormat)

    if (r.status === 'extracted') {
      const parts = [
        `${label}: ${r.scopeItemsCreated} scope item${r.scopeItemsCreated === 1 ? '' : 's'} extracted`,
      ]
      if (r.bomId) {
        const margin = (r.bomGpMarginBps / 100).toFixed(1)
        parts.push(`draft BOM ${formatCompactPhp(r.bomTcvCents)} TCV (${margin}% GP)`)
      }
      if (r.ragMatches > 0) {
        parts.push(`${r.ragMatches} RAG match${r.ragMatches === 1 ? '' : 'es'}`)
      }
      if (r.extensionMismatch) {
        parts.push('(content was DXF despite extension)')
      }
      return parts.join(' · ')
    }
    if (r.status === 'binary-dwg-pending') {
      // Server returns a specific, actionable message in r.message — show that
      // verbatim so users see whether the worker is unconfigured, unreachable,
      // or actively converting.
      return r.message || `DWG${r.dwgVersion ? ` (${r.dwgVersion})` : ''} stored.`
    }
    // Vision branches (no-items / ai-not-configured / too-large / error) ship
    // a human-readable, actionable message in r.message — surface it directly
    // so the user knows whether to re-upload, configure AI, or contact ops.
    if (r.message) return r.message
    if (r.status === 'unknown-format') return 'File stored.'
    return ''
  }
  if (completed.cadFormat) return `${completed.cadFormat.toUpperCase()} uploaded`
  return 'Uploaded'
}
