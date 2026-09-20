'use client'

/**
 * Adds a KYC artifact through Core using an existing account-eligible document.
 *
 * The document selector deliberately owns only presentation state. Core is the
 * authority for account/document relationships, while this component keeps a
 * selected row visible across pages and preserves an exact command after an
 * uncertain mutation outcome.
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
  AccountKycDocumentResult,
  AccountKycDocumentRow,
  KycArtifactCreateCommand,
  KycArtifactType,
} from '@third-code-erp/shared-types'
import { kycArtifactTypeValues } from '@third-code-erp/shared-types'
import {
  addKycArtifact,
  listAccountKycDocuments,
} from '@/app/(dashboard)/crm/accounts/actions'

const PAGE_SIZE = 20

const ARTIFACT_OPTIONS: ReadonlyArray<{
  value: KycArtifactType
  label: string
}> = [
  { value: 'afs_year_1', label: 'AFS — Year 1' },
  { value: 'afs_year_2', label: 'AFS — Year 2' },
  { value: 'afs_year_3', label: 'AFS — Year 3' },
  { value: 'bir_2303', label: 'BIR 2303' },
  { value: 'vat_certificate', label: 'VAT certificate' },
  { value: 'top_suppliers', label: 'Top 10 suppliers' },
  { value: 'top_clients', label: 'Top 10 clients' },
  { value: 'other', label: 'Other' },
]

type PaginationDirection = 'previous' | 'next'

export type AccountKycDocumentOption = Pick<
  AccountKycDocumentRow,
  | 'documentId'
  | 'fileName'
  | 'documentType'
  | 'mimeType'
  | 'projectName'
  | 'opportunityStage'
  | 'opportunityType'
>

interface AddKycArtifactFormProps {
  accountId: string
  disabled?: boolean
}

/** Keep the selected option visible while Core is showing another page. */
export function mergeAccountKycDocumentOptions(
  rows: AccountKycDocumentOption[],
  selected: AccountKycDocumentOption | null,
): AccountKycDocumentOption[] {
  if (!selected || rows.some((row) => row.documentId === selected.documentId)) {
    return rows
  }
  return [selected, ...rows]
}

function newRequestId(): string {
  return globalThis.crypto.randomUUID().toLowerCase()
}

function documentTypeLabel(documentType: string): string {
  return documentType
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function optionLabel(option: AccountKycDocumentOption): string {
  const context = option.projectName
    ? `Project: ${option.projectName}`
    : option.opportunityType
      ? `Opportunity: ${documentTypeLabel(option.opportunityType)}`
      : null
  return [option.fileName, documentTypeLabel(option.documentType), context]
    .filter(Boolean)
    .join(' · ')
}

function selectedContextLabel(option: AccountKycDocumentOption): string {
  const relationship = option.projectName
    ? `Project: ${option.projectName}`
    : option.opportunityType
      ? `Opportunity: ${documentTypeLabel(option.opportunityType)}`
      : 'Account-linked document'
  const stage = option.opportunityStage
    ? ` · Stage: ${documentTypeLabel(option.opportunityStage)}`
    : ''
  return `${option.fileName} · ${documentTypeLabel(option.documentType)} · ${relationship}${stage}`
}

export function AddKycArtifactForm({
  accountId,
  disabled = false,
}: AddKycArtifactFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [artifactType, setArtifactType] = useState<KycArtifactType>(
    kycArtifactTypeValues[0],
  )
  const [documentId, setDocumentId] = useState('')
  const [selectedDocument, setSelectedDocument] =
    useState<AccountKycDocumentOption | null>(null)
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [documents, setDocuments] =
    useState<AccountKycDocumentResult | null>(null)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(!disabled)
  const [page, setPage] = useState(1)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [scopeVersion, setScopeVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [clientRequestId, setClientRequestId] = useState(newRequestId)
  const [uncertainPayload, setUncertainPayload] =
    useState<KycArtifactCreateCommand | null>(null)
  const [selectionNeedsConfirmation, setSelectionNeedsConfirmation] =
    useState(false)
  const requestSequence = useRef(0)
  const mutationSequence = useRef(0)
  const selectedDocumentIdRef = useRef('')
  const previousAccountId = useRef(accountId)
  const pendingPaginationFocus = useRef<{
    direction: PaginationDirection
    sourceElement: HTMLButtonElement
    targetPage: number
  } | null>(null)
  const previousPageButtonRef = useRef<HTMLButtonElement>(null)
  const nextPageButtonRef = useRef<HTMLButtonElement>(null)
  selectedDocumentIdRef.current = documentId

  useEffect(() => {
    if (previousAccountId.current === accountId) return
    previousAccountId.current = accountId
    requestSequence.current += 1
    mutationSequence.current += 1
    const hasScopedDraft =
      Boolean(
        documentId ||
          selectedDocument ||
          activeSearch ||
          search ||
          notes ||
          uncertainPayload ||
          selectionNeedsConfirmation,
      ) ||
      page !== 1 ||
      artifactType !== kycArtifactTypeValues[0]
    if (hasScopedDraft) setScopeVersion((value) => value + 1)
    pendingPaginationFocus.current = null
    setDocuments(null)
    setDocumentsError(null)
    setIsLoadingDocuments(!disabled)
    setPage(1)
    setSearch('')
    setActiveSearch('')
    setDocumentId('')
    setSelectedDocument(null)
    setSelectionNeedsConfirmation(false)
    setArtifactType(kycArtifactTypeValues[0])
    setNotes('')
    setError(null)
    setSuccess(null)
    setUncertainPayload(null)
    setClientRequestId(newRequestId())
  }, [
    accountId,
    artifactType,
    activeSearch,
    disabled,
    documentId,
    notes,
    page,
    search,
    selectedDocument,
    selectionNeedsConfirmation,
    uncertainPayload,
  ])

  useEffect(() => {
    const sequence = ++requestSequence.current
    if (disabled) {
      setIsLoadingDocuments(false)
      setDocumentsError(null)
      setDocuments(null)
      return () => {
        if (requestSequence.current === sequence) requestSequence.current += 1
      }
    }

    setIsLoadingDocuments(true)
    setDocumentsError(null)
    setDocuments(null)

    const selectedDocumentId = selectedDocumentIdRef.current || undefined
    void listAccountKycDocuments(accountId, {
      q: activeSearch,
      page,
      limit: PAGE_SIZE,
      ...(selectedDocumentId ? { selectedDocumentId } : {}),
    })
      .then((result) => {
        if (sequence !== requestSequence.current) return
        if (!result.ok) {
          setDocumentsError(result.error)
          return
        }

        setDocuments(result.data)
        if (selectedDocumentId) {
          const selected = result.data.selectedDocument
          if (selected?.documentId === selectedDocumentId) {
            setSelectedDocument(selected)
            setSelectionNeedsConfirmation(false)
          } else {
            // Core no longer considers this document eligible for this account.
            // Keep the draft ID visible but require an explicit user choice;
            // silently converting it to metadata-only would change intent.
            setSelectedDocument(null)
            setSelectionNeedsConfirmation(true)
          }
        }
      })
      .catch(() => {
        if (sequence === requestSequence.current) {
          setDocumentsError(
            'Account documents could not be loaded. Try again.',
          )
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setIsLoadingDocuments(false)
      })

    return () => {
      if (requestSequence.current === sequence) requestSequence.current += 1
    }
  }, [accountId, activeSearch, disabled, page, reloadNonce, scopeVersion])

  useEffect(() => {
    const pendingFocus = pendingPaginationFocus.current
    if (!pendingFocus || isLoadingDocuments) return

    if (!documents || documents.page !== pendingFocus.targetPage) {
      // A clamped/changed page is a settled response, but not the response
      // that was requested. Never revive that old focus intent later.
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
  }, [accountId, activeSearch, disabled])

  const options = mergeAccountKycDocumentOptions(
    documents?.rows ?? [],
    selectedDocument,
  )

  function onDocumentChange(nextId: string): void {
    if (uncertainPayload) return
    setError(null)
    setSuccess(null)
    const next = options.find((option) => option.documentId === nextId) ?? null
    setDocumentId(next?.documentId ?? '')
    setSelectedDocument(next)
    setSelectionNeedsConfirmation(false)
  }

  function submitSearch(): void {
    if (disabled || isPending || uncertainPayload || isLoadingDocuments) return
    setError(null)
    setSuccess(null)
    pendingPaginationFocus.current = null
    setPage(1)
    if (activeSearch === search.trim()) {
      setReloadNonce((value) => value + 1)
    } else {
      setActiveSearch(search.trim())
    }
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      submitSearch()
    }
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

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (disabled || isPending || isLoadingDocuments) return
    if (selectionNeedsConfirmation && !uncertainPayload) {
      setError(
        'The selected document is no longer available. Choose another document or metadata-only before adding the artifact.',
      )
      return
    }
    setError(null)
    setSuccess(null)

    const payload = uncertainPayload ?? {
      clientRequestId,
      artifactType,
      documentId: documentId || null,
      notes: notes.trim() || null,
    }
    const retryingUncertainPayload = uncertainPayload !== null
    const mutationScope = mutationSequence.current

    startTransition(async () => {
      try {
        const result = await addKycArtifact(accountId, payload)
        if (mutationScope !== mutationSequence.current) return
        if (result.error) {
          if (retryingUncertainPayload || result.outcome === 'unknown') {
            // A rejection during a retry does not prove the first request did
            // not commit. Keep the exact command and identity frozen.
            setUncertainPayload(payload)
            setError(
              retryingUncertainPayload
                ? `${result.error} The original KYC artifact outcome is still unconfirmed; retry the same request.`
                : result.error,
            )
          } else {
            // Only a confirmed rejection allows a fresh deliberate intent.
            setUncertainPayload(null)
            setClientRequestId(newRequestId())
            setError(result.error)
          }
          return
        }

        setUncertainPayload(null)
        setClientRequestId(newRequestId())
        setSuccess(result.success ?? 'KYC artifact added.')
        setDocumentId('')
        setSelectedDocument(null)
        setSelectionNeedsConfirmation(false)
        setNotes('')
        setArtifactType(kycArtifactTypeValues[0])
        router.refresh()
      } catch {
        if (mutationScope !== mutationSequence.current) return
        setUncertainPayload(payload)
        setError(
          'KYC artifact outcome is unconfirmed; retry with the same request.',
        )
      }
    })
  }

  const canGoPrevious = !isLoadingDocuments && page > 1
  const canGoNext =
    !isLoadingDocuments &&
    documents !== null &&
    page < documents.totalPages
  const canSubmit =
    !disabled &&
    !isLoadingDocuments &&
    (uncertainPayload !== null || !selectionNeedsConfirmation)

  return (
    <form
      id="add-kyc-artifact"
      onSubmit={onSubmit}
      aria-labelledby="add-kyc-artifact-title"
      className="form-row"
    >
      <header>
        <h3 id="add-kyc-artifact-title" className="card-title">
          Add KYC artifact
        </h3>
        <p className="card-subtitle">
          Choose an account-eligible document, or record a metadata-only artifact.
        </p>
      </header>

      <div className="form-row-2col">
        <div className="form-row">
          <label htmlFor="kyc-artifact-type" className="form-label">
            Artifact type
          </label>
          <select
            id="kyc-artifact-type"
            value={artifactType}
            onChange={(event) => {
              if (uncertainPayload) return
              setError(null)
              setSuccess(null)
              setArtifactType(event.target.value as KycArtifactType)
            }}
            disabled={disabled || isPending || Boolean(uncertainPayload)}
            className="form-input"
          >
            {ARTIFACT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label htmlFor="kyc-artifact-notes" className="form-label">
            Notes <span style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            id="kyc-artifact-notes"
            value={notes}
            onChange={(event) => {
              if (uncertainPayload) return
              setError(null)
              setSuccess(null)
              setNotes(event.target.value)
            }}
            maxLength={2000}
            disabled={disabled || isPending || Boolean(uncertainPayload)}
            className="form-input"
            aria-describedby="kyc-artifact-notes-help"
          />
          <p id="kyc-artifact-notes-help" className="form-help">
            {notes.length}/2000 characters
          </p>
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="kyc-artifact-search" className="form-label">
          Find an existing document
        </label>
        <div className="card-toolbar" style={{ alignItems: 'stretch' }}>
          <input
            id="kyc-artifact-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={onSearchKeyDown}
            maxLength={200}
            placeholder="Search by file name"
            disabled={disabled || isPending || Boolean(uncertainPayload)}
            className="form-input"
            aria-describedby="kyc-artifact-document-status"
          />
          <button
            type="button"
            onClick={submitSearch}
            disabled={
              disabled ||
              isPending ||
              isLoadingDocuments ||
              Boolean(uncertainPayload)
            }
            className="button-secondary"
          >
            Search
          </button>
        </div>
      </div>

      <div className="form-row">
        <label htmlFor="kyc-artifact-document" className="form-label">
          Supporting document
        </label>
        <select
          id="kyc-artifact-document"
          value={documentId}
          onChange={(event) => onDocumentChange(event.target.value)}
          disabled={
            disabled ||
            isPending ||
            isLoadingDocuments ||
            Boolean(uncertainPayload)
          }
          className="form-input"
          aria-describedby="kyc-artifact-document-status"
        >
          <option value="">Metadata only — no document</option>
          {selectionNeedsConfirmation && documentId && (
            <option value={documentId}>
              Previously selected document — choose again
            </option>
          )}
          {options.map((option) => (
            <option key={option.documentId} value={option.documentId}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
        <p
          id="kyc-artifact-document-status"
          className={documentsError ? 'form-error' : 'form-help'}
          aria-live="polite"
        >
          {documentsError
            ? documentsError
            : isLoadingDocuments
              ? 'Loading account documents…'
              : selectionNeedsConfirmation
                ? 'The selected document is no longer available. Choose another document or metadata-only.'
                : documents && documents.rows.length === 0 && !selectedDocument
                  ? 'No account-eligible documents match this search. Metadata-only artifacts can still be added.'
                  : documents
                    ? `${documents.total.toLocaleString()} eligible document${documents.total === 1 ? '' : 's'} available.`
                    : ''}
        </p>
        {selectedDocument && !documentsError && !isLoadingDocuments && (
          <p className="form-help" aria-live="polite">
            Selected: {selectedContextLabel(selectedDocument)}
          </p>
        )}
        {documentsError && (
          <button
            type="button"
            onClick={() => setReloadNonce((value) => value + 1)}
            disabled={
              disabled ||
              isPending ||
              isLoadingDocuments ||
              Boolean(uncertainPayload)
            }
            className="button-secondary"
          >
            Retry loading documents
          </button>
        )}
        {documents && documents.total > 0 && (
          <div className="card-toolbar" aria-label="Document pages">
            <button
              type="button"
              ref={previousPageButtonRef}
              onClick={() => onPagination('previous')}
              disabled={
                !canGoPrevious ||
                disabled ||
                isPending ||
                Boolean(uncertainPayload)
              }
              className="button-secondary"
            >
              Previous
            </button>
            <span aria-live="polite">
              Page {documents.page} of {documents.totalPages}
            </span>
            <button
              type="button"
              ref={nextPageButtonRef}
              onClick={() => onPagination('next')}
              disabled={
                !canGoNext || disabled || isPending || Boolean(uncertainPayload)
              }
              className="button-secondary"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit || isPending}
        className="button-primary"
      >
        {isPending
          ? uncertainPayload
            ? 'Retrying…'
            : 'Adding…'
          : uncertainPayload
            ? 'Retry same artifact'
            : 'Add artifact'}
      </button>

      {error && (
        <div role="alert" aria-live="assertive" className="form-error">
          {error}
        </div>
      )}
      {success && !error && (
        <div role="status" aria-live="polite" className="form-success">
          {success}
        </div>
      )}
    </form>
  )
}
