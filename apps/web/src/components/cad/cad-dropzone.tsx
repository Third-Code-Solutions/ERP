'use client'

import { useCallback, useRef, useState } from 'react'
import { useCadUpload, CAD_ACCEPT } from './use-cad-upload'
import { IconUpload, IconCheck, IconAlert } from '@/components/ui/icons'

interface CadDropZoneProps {
  projectId: string
  /** Compact variant — single row, smaller padding. Defaults to false (full hero). */
  compact?: boolean
  /** Optional headline override. */
  title?: string
  /** Optional subtitle override. */
  subtitle?: string
}

const ACCEPTED_EXTENSIONS = new Set([
  'dxf', 'dwg',
  'pdf',
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic',
  'xlsx', 'xls',
  'csv',
  'docx', 'doc',
])

function extOf(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx < 0 ? '' : name.slice(idx + 1).toLowerCase()
}

export function CadDropZone({
  projectId,
  compact = false,
  title = 'Drop a CAD drawing, PDF, image, spreadsheet, CSV, or Word document to read source evidence',
  subtitle = 'DWG/DXF parse from drawing entities. PDF, images, XLSX, CSV, and DOCX are read locally without a cloud AI dependency. Up to 100 MB.',
}: CadDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)

  const { isPending, phase, progress, error, lastResult, upload, reset } = useCadUpload({
    projectId,
  })

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      const file = fileList?.[0]
      if (!file) return
      const ext = extOf(file.name)
      if (!ACCEPTED_EXTENSIONS.has(ext)) {
        alert(`Unsupported file type ".${ext}". Accepted: DXF, DWG, PDF, images, Excel.`)
        return
      }
      reset()
      upload(file)
    },
    [upload, reset]
  )

  const trySample = useCallback(async () => {
    try {
      reset()
      const res = await fetch('/samples/mep-sample.dxf')
      if (!res.ok) throw new Error(`sample fetch failed: ${res.status}`)
      const blob = await res.blob()
      const file = new File([blob], 'mep-sample.dxf', {
        type: 'application/dxf',
      })
      upload(file)
    } catch (err) {
      alert(
        `Couldn't load sample DXF: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }, [reset, upload])

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current += 1
    setIsDragging(true)
  }
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setIsDragging(false)
    }
  }
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setIsDragging(false)
    handleFiles(e.dataTransfer?.files ?? null)
  }
  const onClick = () => {
    if (isPending) return
    inputRef.current?.click()
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isPending) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  // Some result statuses are "stored, but source reading did not produce text":
  //   - binary-dwg-pending  → DWG awaiting the Python converter worker
  //   - no-items            → no readable source text was found
  //   - ocr-unavailable     → local image/scanned-PDF OCR is unavailable
  //   - too-large           → file exceeded the local parser budget
  //   - error               → local parsing failed
  // None of these are "green done" — they each ship a specific actionable
  // message in cadResult.message that the progress line already renders.
  const cadResultStatus = lastResult?.cadResult?.status
  const cadResultFormat = lastResult?.cadResult?.detectedFormat
  const NEUTRAL_STATUSES = new Set([
    'binary-dwg-pending',
    'no-items',
    'ocr-unavailable',
    'ai-not-configured',
    'too-large',
    'unknown-format',
  ])
  const isPendingResult = cadResultStatus ? NEUTRAL_STATUSES.has(cadResultStatus) : false
  const isErrorResult =
    cadResultStatus === 'error' ||
    cadResultStatus === 'download-failed' ||
    cadResultStatus === 'parse-failed'

  // Format-aware headline for neutral statuses so an image upload doesn't
  // show "DWG awaiting converter". Each branch describes what actually
  // happened; the subtitle (cadResult.message) carries the actionable detail.
  const pendingHeadline = (() => {
    if (cadResultStatus === 'binary-dwg-pending') return 'Uploaded — DWG awaiting converter'
    const formatLabel =
      cadResultFormat === 'pdf'
        ? 'PDF'
        : cadResultFormat === 'image'
          ? 'Image'
          : cadResultFormat === 'spreadsheet'
            ? 'Spreadsheet'
            : cadResultFormat === 'csv'
              ? 'CSV'
              : cadResultFormat === 'docx'
                ? 'Word doc'
                : 'File'
    if (cadResultStatus === 'no-items') return `${formatLabel} stored — no readable text found`
    if (cadResultStatus === 'ocr-unavailable')
      return `${formatLabel} stored — local OCR unavailable`
    if (cadResultStatus === 'ai-not-configured')
      return `${formatLabel} stored — legacy AI extractor unavailable`
    if (cadResultStatus === 'too-large')
      return `${formatLabel} stored — too large for local reading`
    if (cadResultStatus === 'unknown-format') return 'Uploaded — file stored'
    return 'Uploaded'
  })()
  const showSuccess = phase === 'done' && !error && !isPendingResult && !isErrorResult
  const showError = phase === 'error' || (phase === 'done' && (Boolean(error) || isErrorResult))
  const showPending = phase === 'done' && isPendingResult && !error
  const showProgress = isPending || phase === 'preparing' || phase === 'uploading' || phase === 'finalizing'

  const borderColor = isDragging
    ? 'var(--color-navy-700)'
    : showError
      ? 'var(--color-danger)'
      : showSuccess
        ? 'var(--color-success)'
        : showPending
          ? 'var(--color-info)'
          : 'var(--color-navy-200)'

  const background = isDragging
    ? 'var(--color-navy-50)'
    : showSuccess
      ? 'var(--color-success-soft)'
      : showError
        ? 'var(--color-danger-soft)'
        : showPending
          ? 'var(--color-info-soft)'
          : 'var(--color-surface)'

  const padY = compact ? '16px' : '36px'
  const padX = compact ? '20px' : '32px'

  return (
    <div
      role="button"
      tabIndex={isPending ? -1 : 0}
      aria-label="Drop CAD file to auto-extract scope"
      aria-busy={isPending}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        position: 'relative',
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 12,
        padding: `${padY} ${padX}`,
        background,
        cursor: isPending ? 'wait' : 'pointer',
        transition: 'border-color var(--duration-fast), background var(--duration-fast)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: compact ? 'flex-start' : 'center',
        gap: compact ? 16 : 12,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={CAD_ACCEPT}
        data-testid="scope-cad-input"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files)
          if (inputRef.current) inputRef.current.value = ''
        }}
      />

      {/* Icon */}
      <div
        aria-hidden
        style={{
          width: compact ? 36 : 52,
          height: compact ? 36 : 52,
          borderRadius: compact ? 10 : 14,
          display: 'grid',
          placeItems: 'center',
          background: showSuccess
            ? 'var(--color-success-soft)'
            : showError
              ? 'var(--color-danger-soft)'
              : showPending
                ? 'var(--color-info-soft)'
                : 'var(--color-navy-100)',
          color: showSuccess
            ? 'var(--color-success)'
            : showError
              ? 'var(--color-danger)'
              : showPending
                ? 'var(--color-info)'
                : 'var(--color-navy-700)',
          flexShrink: 0,
          border: `1px solid ${
            showSuccess
              ? 'color-mix(in oklch, var(--color-success) 20%, transparent)'
              : showError
                ? 'color-mix(in oklch, var(--color-danger) 20%, transparent)'
                : showPending
                  ? 'color-mix(in oklch, var(--color-info) 20%, transparent)'
                  : 'color-mix(in oklch, var(--color-navy-700) 12%, transparent)'
          }`,
        }}
      >
        {showSuccess ? (
          <IconCheck size={compact ? 18 : 24} />
        ) : showError ? (
          <IconAlert size={compact ? 18 : 24} />
        ) : showPending ? (
          <IconUpload size={compact ? 18 : 24} />
        ) : (
          <IconUpload size={compact ? 18 : 24} />
        )}
      </div>

      {/* Text + status */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: compact ? 'flex-start' : 'center',
          gap: 4,
          textAlign: compact ? 'left' : 'center',
          flex: compact ? 1 : 'initial',
          minWidth: 0,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: compact ? 13 : 15,
            fontWeight: 600,
            color: 'var(--color-neutral-900)',
            letterSpacing: '-0.01em',
          }}
        >
          {showSuccess
            ? 'Done'
            : showError
              ? 'Upload error'
              : showPending
                ? pendingHeadline
                : isDragging
                  ? 'Drop to upload'
                  : title}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: 'var(--color-neutral-500)',
            maxWidth: compact ? 'none' : 460,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: compact ? 'nowrap' : 'normal',
          }}
        >
          {showProgress && progress
            ? progress
            : showSuccess && progress
              ? progress
              : showError
                ? error
                : subtitle}
        </p>
        {!compact && !showProgress && phase !== 'done' && phase !== 'error' ? (
          <div
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: 'var(--color-navy-700)',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>Click to browse, or drag a file here</span>
            <span style={{ color: 'var(--color-neutral-300)' }}>·</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void trySample()
              }}
              style={{
                background: 'transparent',
                border: 0,
                padding: 0,
                color: 'var(--color-navy-700)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Try a sample MEP drawing
            </button>
          </div>
        ) : null}
        {/* Show secondary success line below the main one */}
        {showSuccess && lastResult?.cadResult && lastResult.cadResult.status === 'extracted' && lastResult.cadResult.bomId ? (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: 'var(--color-success)',
              fontWeight: 500,
            }}
          >
            {lastResult.cadResult.unpricedCandidateBom
              ? 'View the unpriced candidate BOM →'
              : 'View the new draft BOM →'}
          </p>
        ) : null}
      </div>

      {/* Compact-mode action label on the right */}
      {compact && phase === 'idle' ? (
        <span
          style={{
            fontSize: 12.5,
            color: 'var(--color-navy-700)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Drop or click to upload
        </span>
      ) : null}
    </div>
  )
}
