'use client'

/**
 * ClaimDocumentAttach — attaches an existing project document to a claim.
 *
 * Documents are loaded from Core in pages so this form never relies on a
 * capped, page-local list or asks the user to copy a UUID. The request ID is
 * kept with the draft so a timeout can be retried without creating a second
 * attachment; a confirmed result starts a fresh request identity.
 */

import React, {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import type {
  ClaimDocumentAttachCommand,
  ProjectDocumentListResult,
  ProjectDocumentRow,
} from '@third-code-erp/shared-types'
import {
  attachClaimDocument,
  listClaimDocuments,
} from '@/app/(dashboard)/claims/[id]/actions'

const PAGE_SIZE = 25

const KIND_OPTIONS = [
  { value: 'photo', label: 'Photo' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'measurement', label: 'Measurement' },
  { value: 'other', label: 'Other' },
] as const

type Kind = (typeof KIND_OPTIONS)[number]['value']
type PaginationDirection = 'previous' | 'next'

export type ClaimDocumentOption = Pick<
  ProjectDocumentRow,
  'id' | 'fileName' | 'documentType'
>

interface ClaimDocumentAttachProps {
  claimId: string
  disabled?: boolean
}

/** Keep a selected option visible while the server is showing another page. */
export function mergeClaimDocumentOptions(
  rows: ClaimDocumentOption[],
  selected: ClaimDocumentOption | null,
): ClaimDocumentOption[] {
  if (!selected || rows.some((row) => row.id === selected.id)) return rows
  return [selected, ...rows]
}

function newRequestId(): string {
  return globalThis.crypto.randomUUID()
}

function documentTypeLabel(documentType: ClaimDocumentOption['documentType']): string {
  return documentType === 'dxf'
    ? 'DXF'
    : documentType.charAt(0).toUpperCase() + documentType.slice(1)
}

function optionLabel(option: ClaimDocumentOption): string {
  return `${option.fileName} · ${documentTypeLabel(option.documentType)}`
}

export function ClaimDocumentAttach({
  claimId,
  disabled = false,
}: ClaimDocumentAttachProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [documentId, setDocumentId] = useState('')
  const [selectedDocument, setSelectedDocument] =
    useState<ClaimDocumentOption | null>(null)
  const [kind, setKind] = useState<Kind>('photo')
  const [caption, setCaption] = useState('')
  const [clientRequestId, setClientRequestId] = useState(newRequestId)
  const [documents, setDocuments] = useState<ProjectDocumentListResult | null>(
    null,
  )
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(!disabled)
  const [page, setPage] = useState(1)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const [uncertainPayload, setUncertainPayload] =
    useState<ClaimDocumentAttachCommand | null>(null)
  const pendingPaginationFocus = useRef<{
    direction: PaginationDirection
    sourceElement: HTMLButtonElement
    targetPage: number
  } | null>(null)
  const previousPageButtonRef = useRef<HTMLButtonElement>(null)
  const nextPageButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const sequence = ++requestSequence.current
    if (disabled) {
      setIsLoadingDocuments(false)
      setDocumentsError(null)
      return () => {
        if (requestSequence.current === sequence) requestSequence.current += 1
      }
    }

    setIsLoadingDocuments(true)
    setDocumentsError(null)
    setDocuments(null)

    void listClaimDocuments(claimId, { page, limit: PAGE_SIZE })
      .then((result) => {
        if (sequence !== requestSequence.current) return
        if (!result.ok) {
          setDocumentsError(result.error)
          return
        }
        setDocuments(result.data)
      })
      .catch(() => {
        if (sequence === requestSequence.current) {
          setDocumentsError(
            'Project documents could not be loaded. Try again.',
          )
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setIsLoadingDocuments(false)
      })

    return () => {
      if (requestSequence.current === sequence) requestSequence.current += 1
    }
  }, [claimId, disabled, page, reloadNonce])

  useEffect(() => {
    const pendingFocus = pendingPaginationFocus.current
    if (!pendingFocus || isLoadingDocuments) return

    if (!documents || documents.page !== pendingFocus.targetPage) {
      pendingPaginationFocus.current = null
      return
    }

    pendingPaginationFocus.current = null

    const activeElement = document.activeElement
    if (
      activeElement !== document.body &&
      activeElement !== pendingFocus.sourceElement
    ) {
      return
    }

    const requestedButton =
      pendingFocus.direction === 'previous'
        ? previousPageButtonRef.current
        : nextPageButtonRef.current
    const fallbackButton =
      pendingFocus.direction === 'previous'
        ? nextPageButtonRef.current
        : previousPageButtonRef.current
    const button =
      requestedButton && !requestedButton.disabled
        ? requestedButton
        : fallbackButton && !fallbackButton.disabled
          ? fallbackButton
          : null
    button?.focus()
  }, [documents, isLoadingDocuments])

  useEffect(() => {
    return () => {
      pendingPaginationFocus.current = null
    }
  }, [claimId, disabled])

  const options = mergeClaimDocumentOptions(
    documents?.rows ?? [],
    selectedDocument,
  )

  function rotateForNewIntent(): void {
    if (uncertainPayload) return
    setError(null)
    setSuccess(null)
  }

  function onDocumentChange(nextId: string): void {
    if (uncertainPayload) return
    rotateForNewIntent()
    const next = options.find((option) => option.id === nextId) ?? null
    setDocumentId(next?.id ?? '')
    setSelectedDocument(next)
  }

  function onKindChange(nextKind: Kind): void {
    if (uncertainPayload) return
    rotateForNewIntent()
    setKind(nextKind)
  }

  function onCaptionChange(nextCaption: string): void {
    if (uncertainPayload) return
    rotateForNewIntent()
    setCaption(nextCaption)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    const payload = uncertainPayload ??
      (selectedDocument && documentId
        ? {
            clientRequestId,
            documentId: documentId.toLowerCase(),
            kind,
            caption: caption.trim() || null,
          }
        : null)
    if (!payload) {
      setError('Select a project document.')
      return
    }
    const retryingUncertainPayload = uncertainPayload !== null

    startTransition(async () => {
      try {
        const result = await attachClaimDocument(claimId, payload)
        if (result.error) {
          if (retryingUncertainPayload || result.outcome === 'unknown') {
            // Keep the exact command frozen. A later rejection while retrying
            // cannot prove that the original uncertain request did not commit.
            setUncertainPayload(payload)
            setError(
              retryingUncertainPayload
                ? `${result.error} The original attachment outcome is still unconfirmed; retry the same request.`
                : result.error,
            )
          } else {
            // A confirmed rejection did not commit this command. Rotate the
            // identity before allowing the user to form a new intent.
            setUncertainPayload(null)
            setClientRequestId(newRequestId())
            setError(result.error)
          }
          return
        }

        setUncertainPayload(null)
        setClientRequestId(newRequestId())
        setSuccess(result.success ?? 'Document attached.')
        setDocumentId('')
        setSelectedDocument(null)
        setCaption('')
        setKind('photo')
        router.refresh()
      } catch {
        setUncertainPayload(payload)
        setError(
          'Attachment outcome is unconfirmed; retry with the same request.',
        )
      }
    })
  }

  function onPagination(direction: PaginationDirection): void {
    if (isLoadingDocuments || disabled || isPending || uncertainPayload) return

    const button =
      direction === 'previous'
        ? previousPageButtonRef.current
        : nextPageButtonRef.current
    const nextPage =
      direction === 'previous' ? Math.max(1, page - 1) : page + 1
    if (button && document.activeElement === button) {
      pendingPaginationFocus.current = {
        direction,
        sourceElement: button,
        targetPage: nextPage,
      }
    } else {
      pendingPaginationFocus.current = null
    }
    setIsLoadingDocuments(true)
    setPage(nextPage)
  }

  const canGoPrevious = !isLoadingDocuments && page > 1
  const canGoNext =
    !isLoadingDocuments && documents !== null && page < documents.totalPages
  const canSubmit = Boolean(uncertainPayload || documentId)

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby="claim-document-attach-title"
      className="card"
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
      }}
    >
      <header>
        <h2 id="claim-document-attach-title" className="card-title">
          Attach document
        </h2>
        <p className="card-subtitle">
          Choose an existing document from this claim&apos;s project.
        </p>
      </header>

      <div className="form-row">
        <label htmlFor="claim-document-id" className="form-label">
          Project document
        </label>
        <select
          id="claim-document-id"
          value={documentId}
          onChange={(event) => onDocumentChange(event.target.value)}
          disabled={disabled || isPending || isLoadingDocuments || Boolean(uncertainPayload)}
          className="form-input"
          aria-describedby="claim-document-status"
        >
          <option value="">
            {isLoadingDocuments
              ? 'Loading project documents…'
              : 'Select a project document…'}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
        <p
          id="claim-document-status"
          className={documentsError ? 'form-error' : 'form-help'}
          aria-live="polite"
        >
          {documentsError
            ? documentsError
            : documents && documents.rows.length === 0 && !selectedDocument
              ? 'No project documents are available.'
              : documents
                ? `${documents.total.toLocaleString()} project document${documents.total === 1 ? '' : 's'} available.`
                : ''}
        </p>
        {documentsError && (
          <button
            type="button"
            onClick={() => setReloadNonce((value) => value + 1)}
            disabled={disabled || isPending || isLoadingDocuments || Boolean(uncertainPayload)}
            className="button-secondary"
          >
            Retry loading documents
          </button>
        )}
        {documents && documents.total > 0 && (
          <div
            className="card-toolbar"
            style={{ marginTop: 2, flexWrap: 'wrap' }}
          >
            <button
              type="button"
              ref={previousPageButtonRef}
              onClick={() => onPagination('previous')}
              disabled={!canGoPrevious || disabled || isPending || Boolean(uncertainPayload)}
              className="button-secondary"
            >
              Previous
            </button>
            <span
              style={{ flex: '1 1 120px', textAlign: 'center' }}
            >
              Page {documents.page} of {documents.totalPages}
            </span>
            <button
              type="button"
              ref={nextPageButtonRef}
              onClick={() => onPagination('next')}
              disabled={!canGoNext || disabled || isPending || Boolean(uncertainPayload)}
              className="button-secondary"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="form-row-2col">
        <div className="form-row">
          <label htmlFor="claim-document-kind" className="form-label">
            Attachment kind
          </label>
          <select
            id="claim-document-kind"
            value={kind}
            onChange={(event) => onKindChange(event.target.value as Kind)}
            disabled={disabled || isPending || Boolean(uncertainPayload)}
            className="form-input"
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label htmlFor="claim-document-caption" className="form-label">
            Caption <span style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="claim-document-caption"
            type="text"
            value={caption}
            onChange={(event) => onCaptionChange(event.target.value)}
            maxLength={255}
            disabled={disabled || isPending || Boolean(uncertainPayload)}
            className="form-input"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled || isPending || isLoadingDocuments || !canSubmit}
        className="button-primary"
      >
        {isPending
          ? uncertainPayload
            ? 'Retrying…'
            : 'Attaching…'
          : uncertainPayload
            ? 'Retry same attachment'
            : 'Attach document'}
      </button>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="form-error"
          style={{
            background: 'var(--color-danger-soft)',
            padding: '8px 10px',
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}
      {success && !error && (
        <div
          role="status"
          aria-live="polite"
          className="form-success"
          style={{
            background: 'var(--color-success-soft)',
            padding: '8px 10px',
            borderRadius: 6,
          }}
        >
          {success}
        </div>
      )}
    </form>
  )
}
