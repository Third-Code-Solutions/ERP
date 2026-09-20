'use client'

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  MS_PROJECT_XML_MAX_DECODED_BYTES,
  msProjectXmlCommitCommandSchema,
  msProjectXmlImportResultSchema,
  msProjectXmlPreviewCommandSchema,
  msProjectXmlPreviewResultSchema,
  type MsProjectXmlCommitCommand,
  type MsProjectXmlImportResult,
  type MsProjectXmlPreviewCommand,
  type MsProjectXmlPreview,
  type MsProjectXmlPreviewResult,
  type MsProjectXmlPreviewTask,
  type MsProjectXmlTaskMapping,
  type ProjectScheduleLevel,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import {
  importMsProjectXmlAction,
  previewMsProjectXmlAction,
} from '@/app/(dashboard)/projects/[id]/schedule/ms-project-xml-actions'

type Scope = { projectId: string; tenantId: string; actorId: string }

type SelectedSource = {
  command: MsProjectXmlPreviewCommand
  sourceHash: string
  sourceBytes: number
}

type PreviewCommand = {
  source: SelectedSource
  scope: Scope
  token: number
}

type ImportCommand = {
  command: MsProjectXmlCommitCommand
  scope: Scope
  unknownObserved: boolean
}

type PreviewPhase = 'idle' | 'pending'
type ImportPhase = 'idle' | 'pending' | 'unknown'

type ActionFailure = { ok: false; error: string; outcomeUnknown?: boolean }
type PreviewActionResult =
  | { ok: true; data: MsProjectXmlPreviewResult; refreshWarning?: string }
  | ActionFailure
type ImportActionResult =
  | { ok: true; data: MsProjectXmlImportResult; refreshWarning?: string }
  | ActionFailure

type PreviewAction = (input: {
  command: MsProjectXmlPreviewCommand
  expectedScope: { tenantId: string; actorId: string }
}) => Promise<PreviewActionResult>
type ImportAction = (input: {
  command: MsProjectXmlCommitCommand
  expectedScope: { tenantId: string; actorId: string }
}) => Promise<ImportActionResult>

const previewAction: PreviewAction = previewMsProjectXmlAction
const importAction: ImportAction = importMsProjectXmlAction

const uuidSchema = z.string().uuid()
const previewActionSuccessSchema = z.object({
  ok: z.literal(true),
  data: msProjectXmlPreviewResultSchema,
  refreshWarning: z.string().max(500).optional(),
})
const importActionSuccessSchema = z.object({
  ok: z.literal(true),
  data: msProjectXmlImportResultSchema,
  refreshWarning: z.string().max(500).optional(),
})

const UNKNOWN_IMPORT_MESSAGE =
  'Import outcome is unconfirmed. The exact reviewed command is retained; retry it to reconcile the saved result.'
const REVIEW_PAGE_SIZE = 50

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sameUuid(left: string, right: string): boolean {
  const parsedLeft = uuidSchema.safeParse(left)
  const parsedRight = uuidSchema.safeParse(right)
  return (
    parsedLeft.success &&
    parsedRight.success &&
    parsedLeft.data.toLowerCase() === parsedRight.data.toLowerCase()
  )
}

function sameScope(left: Scope, right: Scope): boolean {
  return (
    sameUuid(left.projectId, right.projectId) &&
    sameUuid(left.tenantId, right.tenantId) &&
    sameUuid(left.actorId, right.actorId)
  )
}

function safeActionError(value: unknown, fallback: string): string | null {
  if (!isRecord(value) || typeof value.error !== 'string') return null
  const message = value.error.trim()
  return message.length > 0 ? message.slice(0, 500) : fallback
}

function isOutcomeUnknown(value: unknown): boolean {
  return isRecord(value) && value.outcomeUnknown === true
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return globalThis.btoa(binary)
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes.byteLength)
  digestInput.set(bytes)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', digestInput.buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function withRefreshOutcome(
  message: string,
  refreshWarning: string | undefined,
  refreshFailed: boolean,
): string {
  const additions = [
    refreshWarning ? `Refresh warning: ${refreshWarning}` : null,
    refreshFailed
      ? 'The import committed, but the page could not refresh. Reload to view the updated schedule.'
      : null,
  ].filter((value): value is string => value !== null)
  return additions.length > 0 ? `${message} ${additions.join(' ')}` : message
}

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString('en-PH')} bytes`
}

function mappingFor(
  task: MsProjectXmlPreviewTask,
  selectedLevel: string | undefined,
): MsProjectXmlTaskMapping | null {
  if (
    selectedLevel !== 'l1' &&
    selectedLevel !== 'l2' &&
    selectedLevel !== 'l3' &&
    selectedLevel !== 'l4'
  ) {
    return null
  }
  return {
    sourceUid: task.sourceUid,
    sourceOutlineLevel: task.outlineLevel,
    level: selectedLevel,
    ownerId: null,
  }
}

function validateImportReceipt(
  result: MsProjectXmlImportResult,
  command: ImportCommand,
): boolean {
  const { command: expected, scope } = command
  const receipt = result.receipt
  if (
    !sameUuid(result.projectId, expected.projectId) ||
    !sameUuid(result.requestId, expected.requestId) ||
    result.sourceHash !== expected.sourceHash ||
    result.parserVersion !== expected.parserVersion ||
    !sameUuid(receipt.tenantId, scope.tenantId) ||
    !sameUuid(receipt.actorId, scope.actorId) ||
    !sameUuid(receipt.projectId, expected.projectId) ||
    !sameUuid(receipt.requestId, expected.requestId) ||
    receipt.sourceHash !== expected.sourceHash ||
    receipt.parserVersion !== expected.parserVersion ||
    receipt.mappings.length !== expected.mappings.length ||
    receipt.tasks.length !== expected.mappings.length
  ) {
    return false
  }

  const expectedMappings = new Map(expected.mappings.map((mapping) => [mapping.sourceUid, mapping]))
  const returnedMappings = new Map(receipt.mappings.map((mapping) => [mapping.sourceUid, mapping]))
  const returnedTasks = new Map(receipt.tasks.map((task) => [task.sourceUid, task]))
  if (
    expectedMappings.size !== expected.mappings.length ||
    returnedMappings.size !== receipt.mappings.length ||
    returnedTasks.size !== receipt.tasks.length
  ) {
    return false
  }

  return expected.mappings.every((mapping) => {
    const returnedMapping = returnedMappings.get(mapping.sourceUid)
    const returnedTask = returnedTasks.get(mapping.sourceUid)
    return Boolean(
      returnedMapping &&
        returnedTask &&
        returnedMapping.sourceOutlineLevel === mapping.sourceOutlineLevel &&
        returnedMapping.level === mapping.level &&
        returnedMapping.ownerId === mapping.ownerId &&
        returnedTask.level === mapping.level &&
        returnedTask.ownerId === mapping.ownerId &&
        returnedTask.version === 1 &&
        uuidSchema.safeParse(returnedTask.taskId).success,
    )
  })
}

function validateMappingRelationships(
  tasks: MsProjectXmlPreviewTask[],
  mappingLevels: Record<string, ProjectScheduleLevel | ''>,
): string | null {
  const levelOrder: Record<ProjectScheduleLevel, number> = { l1: 1, l2: 2, l3: 3, l4: 4 }
  const levelsByUid = new Map(
    tasks.map((task) => [task.sourceUid, mappingLevels[String(task.sourceUid)] ?? '']),
  )
  for (const task of tasks) {
    const currentLevel = levelsByUid.get(task.sourceUid)
    if (!currentLevel) continue
    if (task.parentSourceUid !== null) {
      const parentLevel = levelsByUid.get(task.parentSourceUid)
      if (parentLevel && levelOrder[parentLevel as ProjectScheduleLevel] >= levelOrder[currentLevel]) {
        return `UID ${task.sourceUid} must map below its parent UID ${task.parentSourceUid}.`
      }
    }
    if (task.predecessor) {
      const predecessorLevel = levelsByUid.get(task.predecessor.predecessorUid)
      if (predecessorLevel && predecessorLevel !== currentLevel) {
        return `UID ${task.sourceUid} must stay at the same ERP level as predecessor UID ${task.predecessor.predecessorUid}.`
      }
    }
  }
  return null
}

function valueForOutlineDepth(
  tasks: MsProjectXmlPreviewTask[],
  mappingLevels: Record<string, ProjectScheduleLevel | ''>,
  outlineLevel: number,
): ProjectScheduleLevel | '' {
  const values = tasks
    .filter((task) => task.outlineLevel === outlineLevel)
    .map((task) => mappingLevels[String(task.sourceUid)] ?? '')
  const first = values[0]
  return first && values.every((value) => value === first) ? first : ''
}

function PreviewIssues({ preview }: { preview: MsProjectXmlPreview }) {
  return (
    <>
      {preview.issues.length > 0 && (
        <div className="cost-form__error" role="alert">
          <strong>Preview needs attention</strong>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
            {preview.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.path}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      {preview.notices.length > 0 && (
        <div className="form-help" role="note">
          <strong>Preview notices</strong>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
            {preview.notices.map((notice, index) => (
              <li key={`${notice.code}-${notice.path}-${index}`}>{notice.message}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

export function MsProjectXmlImporter({
  projectId,
  tenantId,
  actorId,
  canManage,
}: {
  projectId: string
  tenantId: string
  actorId: string
  canManage: boolean
}) {
  const router = useRouter()
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null)
  const [previewSelection, setPreviewSelection] = useState<{
    source: SelectedSource
    result: MsProjectXmlPreviewResult
  } | null>(null)
  const [mappingLevels, setMappingLevels] = useState<Record<string, ProjectScheduleLevel | ''>>({})
  const [reviewPage, setReviewPage] = useState(0)
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>('idle')
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle')
  const [readingFile, setReadingFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [committedImport, setCommittedImport] = useState<MsProjectXmlImportResult | null>(null)
  const [pending, startTransition] = useTransition()
  const mountedRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewInFlightRef = useRef(false)
  const importInFlightRef = useRef(false)
  const readingFileRef = useRef(false)
  const selectionTokenRef = useRef(0)
  const lastScopeRef = useRef<Scope>({ projectId, tenantId, actorId })
  const scopeRef = useRef<Scope>({ projectId, tenantId, actorId })
  const previewCommandRef = useRef<PreviewCommand | null>(null)
  const importCommandRef = useRef<ImportCommand | null>(null)

  const scope = { projectId, tenantId, actorId }
  scopeRef.current = scope

  const preview = previewSelection?.result.preview ?? null
  const tasks = preview?.tasks ?? []
  const pageCount = Math.max(1, Math.ceil(tasks.length / REVIEW_PAGE_SIZE))
  const currentPage = Math.min(reviewPage, pageCount - 1)
  const pageStart = currentPage * REVIEW_PAGE_SIZE
  const visibleTasks = tasks.slice(pageStart, pageStart + REVIEW_PAGE_SIZE)
  const outlineDepths = Array.from(new Set(tasks.map((task) => task.outlineLevel))).sort((left, right) => left - right)
  const mappedCount = tasks.reduce(
    (count, task) => count + (mappingLevels[String(task.sourceUid)] ? 1 : 0),
    0,
  )
  const allTasksMapped = tasks.length > 0 && mappedCount === tasks.length
  const mappingRelationshipError = validateMappingRelationships(tasks, mappingLevels)
  const commandBusy = previewPhase !== 'idle' || importPhase !== 'idle'
  const controlsDisabled = commandBusy || readingFile || pending

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const nextScope = { projectId, tenantId, actorId }
    const scopeChanged = !sameScope(lastScopeRef.current, nextScope)
    lastScopeRef.current = nextScope
    const activePreview = previewCommandRef.current
    const activeImport = importCommandRef.current
    const stalePreview = previewSelection && !sameScope(previewSelection.result, nextScope)
    if (!scopeChanged && !activePreview && !activeImport && !stalePreview) return

    const previewScopeChanged = activePreview && !sameScope(activePreview.scope, nextScope)
    const importScopeChanged = activeImport && !sameScope(activeImport.scope, nextScope)
    if (!scopeChanged && !previewScopeChanged && !importScopeChanged && !stalePreview) return

    selectionTokenRef.current += 1
    previewCommandRef.current = null
    importCommandRef.current = null
    previewInFlightRef.current = false
    importInFlightRef.current = false
    setPreviewPhase('idle')
    setImportPhase('idle')
    setSelectedSource(null)
    setPreviewSelection(null)
    setMappingLevels({})
    setReviewPage(0)
    setReviewConfirmed(false)
    setCommittedImport(null)
    setReadingFile(false)
    setError(null)
    setNotice(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [actorId, projectId, selectedSource, previewSelection, tenantId])

  function isCurrentPreviewCommand(command: PreviewCommand): boolean {
    return (
      mountedRef.current &&
      previewCommandRef.current === command &&
      command.token === selectionTokenRef.current &&
      sameScope(command.scope, scopeRef.current)
    )
  }

  function isCurrentImportCommand(command: ImportCommand): boolean {
    return (
      mountedRef.current &&
      importCommandRef.current === command &&
      sameScope(command.scope, scopeRef.current)
    )
  }

  function releasePreview(command: PreviewCommand) {
    if (previewCommandRef.current !== command) return
    previewCommandRef.current = null
    previewInFlightRef.current = false
    setPreviewPhase('idle')
  }

  function markImportUnknown(command: ImportCommand) {
    if (!isCurrentImportCommand(command)) return
    command.unknownObserved = true
    importInFlightRef.current = false
    setImportPhase('unknown')
    setError(UNKNOWN_IMPORT_MESSAGE)
    setNotice(null)
  }

  function releaseImport(command: ImportCommand) {
    if (importCommandRef.current !== command) return
    importCommandRef.current = null
    importInFlightRef.current = false
    setImportPhase('idle')
  }

  function runPreview(command: PreviewCommand) {
    if (
      previewCommandRef.current ||
      previewInFlightRef.current ||
      !canManage ||
      !mountedRef.current ||
      command.token !== selectionTokenRef.current ||
      !sameScope(command.scope, scopeRef.current)
    ) {
      return
    }
    previewCommandRef.current = command

    previewInFlightRef.current = true
    setError(null)
    setNotice(null)
    setPreviewPhase('pending')
    startTransition(() => {
      void (async () => {
        let result: PreviewActionResult
        try {
          result = await previewAction({
            command: command.source.command,
            expectedScope: {
              tenantId: command.scope.tenantId,
              actorId: command.scope.actorId,
            },
          })
        } catch {
          if (isCurrentPreviewCommand(command)) {
            releasePreview(command)
            setError('Preview unavailable. Check the selected XML and schedule permissions, then retry.')
          }
          return
        }

        if (!isCurrentPreviewCommand(command)) return
        if (isOutcomeUnknown(result)) {
          releasePreview(command)
          setError('Preview unavailable. Check the selected XML and schedule permissions, then retry.')
          return
        }

        const parsed = previewActionSuccessSchema.safeParse(result)
        if (!parsed.success) {
          releasePreview(command)
          const knownError = safeActionError(result, 'Preview unavailable.')
          if (mountedRef.current) setError(knownError ?? 'Preview unavailable.')
          return
        }

        const data = parsed.data.data
        if (
          !sameUuid(data.tenantId, command.scope.tenantId) ||
          !sameUuid(data.actorId, command.scope.actorId) ||
          !sameUuid(data.projectId, command.scope.projectId) ||
          (data.preview.sourceHash !== null &&
            data.preview.sourceHash !== command.source.sourceHash)
        ) {
          releasePreview(command)
          setError('Preview did not match this file and account. Reload and preview again.')
          return
        }

        releasePreview(command)
        setPreviewSelection({ source: command.source, result: data })
        setMappingLevels({})
        setReviewPage(0)
        setReviewConfirmed(false)
        setCommittedImport(null)
        setError(null)
        setNotice(
          parsed.data.refreshWarning
            ? `Preview loaded. Refresh warning: ${parsed.data.refreshWarning}`
            : 'Preview loaded. Review every task before confirming the planning import.',
        )
      })()
    })
  }

  function runImport(command: ImportCommand, retry = false) {
    if (retry) {
      if (
        importCommandRef.current !== command ||
        !command.unknownObserved ||
        importPhase !== 'unknown' ||
        importInFlightRef.current ||
        !canManage ||
        !isCurrentImportCommand(command)
      ) {
        return
      }
    } else {
      if (
        importCommandRef.current ||
        importInFlightRef.current ||
        !canManage ||
        !mountedRef.current ||
        !sameScope(command.scope, scopeRef.current)
      ) {
        return
      }
      importCommandRef.current = command
    }

    importInFlightRef.current = true
    setError(null)
    setNotice(null)
    setImportPhase('pending')
    startTransition(() => {
      void (async () => {
        let result: ImportActionResult
        try {
          result = await importAction({
            command: command.command,
            expectedScope: {
              tenantId: command.scope.tenantId,
              actorId: command.scope.actorId,
            },
          })
        } catch {
          markImportUnknown(command)
          return
        }

        if (!isCurrentImportCommand(command)) return
        if (isOutcomeUnknown(result)) {
          markImportUnknown(command)
          return
        }

        const parsed = importActionSuccessSchema.safeParse(result)
        if (!parsed.success) {
          const knownError = safeActionError(result, 'Import was not confirmed.')
          if (knownError && !command.unknownObserved) {
            releaseImport(command)
            if (mountedRef.current) setError(knownError)
          } else {
            markImportUnknown(command)
          }
          return
        }
        if (!validateImportReceipt(parsed.data.data, command)) {
          markImportUnknown(command)
          return
        }

        let refreshFailed = false
        try {
          router.refresh()
        } catch {
          refreshFailed = true
        }
        if (!isCurrentImportCommand(command)) return
        releaseImport(command)
        setCommittedImport(parsed.data.data)
        setError(null)
        if (mountedRef.current) {
          setNotice(
            withRefreshOutcome(
              parsed.data.data.created
                ? `Import committed: ${parsed.data.data.receipt.tasks.length} planning tasks imported.`
                : 'Import committed: this reviewed XML import was already committed; its receipt was recovered.',
              parsed.data.refreshWarning,
              refreshFailed,
            ),
          )
        }
      })()
    })
  }

  async function readSelectedFile(file: File | undefined) {
    const token = selectionTokenRef.current + 1
    selectionTokenRef.current = token
    setError(null)
    setNotice(null)
    setSelectedSource(null)
    setPreviewSelection(null)
    setMappingLevels({})
    setReviewPage(0)
    setReviewConfirmed(false)
    setCommittedImport(null)
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.xml')) {
      setError('Only exported MS Project XML (.xml) files are supported; native .mpp files are not accepted.')
      return
    }

    if (file.size === 0) {
      setError('The XML file is empty. Choose a non-empty exported XML file.')
      return
    }
    if (file.size > MS_PROJECT_XML_MAX_DECODED_BYTES) {
      setError('The XML file exceeds the 1 MiB limit. Choose a smaller exported XML file.')
      return
    }

    readingFileRef.current = true
    setReadingFile(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!mountedRef.current || token !== selectionTokenRef.current) return
      if (bytes.byteLength > MS_PROJECT_XML_MAX_DECODED_BYTES) {
        setError('The XML file exceeds the 1 MiB limit. Choose a smaller exported XML file.')
        return
      }
      const sourceHash = await sha256Hex(bytes)
      if (!mountedRef.current || token !== selectionTokenRef.current) return
      const parsed = msProjectXmlPreviewCommandSchema.safeParse({
        projectId,
        sourceBase64: encodeBase64(bytes),
        fileName: file.name,
      })
      if (!parsed.success) {
        setError('Choose a valid exported XML file within the 1 MiB limit.')
        return
      }
      setSelectedSource({
        command: parsed.data,
        sourceHash,
        sourceBytes: bytes.byteLength,
      })
    } catch {
      if (mountedRef.current && token === selectionTokenRef.current) {
        setError('The selected XML file could not be read. Choose it again and retry.')
      }
    } finally {
      readingFileRef.current = false
      if (mountedRef.current && token === selectionTokenRef.current) setReadingFile(false)
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (
      importCommandRef.current ||
      importInFlightRef.current ||
      previewCommandRef.current ||
      previewInFlightRef.current ||
      readingFile ||
      readingFileRef.current ||
      importPhase !== 'idle' ||
      previewPhase !== 'idle'
    ) {
      event.currentTarget.value = ''
      return
    }
    void readSelectedFile(event.currentTarget.files?.[0])
  }

  function startPreview() {
    if (!selectedSource || !canManage || commandBusy || !mountedRef.current) return
    const command: PreviewCommand = {
      source: selectedSource,
      scope: { ...scope },
      token: selectionTokenRef.current,
    }
    runPreview(command)
  }

  function updateMapping(sourceUid: number, level: string) {
    if (commandBusy || !canManage || committedImport) return
    if (level !== '' && level !== 'l1' && level !== 'l2' && level !== 'l3' && level !== 'l4') return
    setMappingLevels((current) => ({ ...current, [String(sourceUid)]: level }))
    setReviewConfirmed(false)
  }

  function updateOutlineDepth(outlineLevel: number, level: string) {
    if (commandBusy || !canManage || committedImport) return
    if (level !== '' && level !== 'l1' && level !== 'l2' && level !== 'l3' && level !== 'l4') return
    setMappingLevels((current) => {
      const next = { ...current }
      tasks.forEach((task) => {
        if (task.outlineLevel === outlineLevel) {
          next[String(task.sourceUid)] = level as ProjectScheduleLevel | ''
        }
      })
      return next
    })
    setReviewConfirmed(false)
  }

  function startImport() {
    if (
      !previewSelection ||
      !previewSelection.result.preview.canImport ||
      !allTasksMapped ||
      Boolean(mappingRelationshipError) ||
      !reviewConfirmed ||
      committedImport ||
      !canManage ||
      commandBusy ||
      !mountedRef.current
    ) {
      return
    }
    const sourceHash = previewSelection.result.preview.sourceHash
    if (!sourceHash) {
      setError('This preview has no verified source hash and cannot be imported.')
      return
    }
    if (mappingRelationshipError) {
      setError(mappingRelationshipError)
      return
    }
    const mappings = tasks
      .map((task) => mappingFor(task, mappingLevels[String(task.sourceUid)]))
      .filter((mapping): mapping is MsProjectXmlTaskMapping => mapping !== null)
    const parsed = msProjectXmlCommitCommandSchema.safeParse({
      projectId,
      sourceBase64: previewSelection.source.command.sourceBase64,
      sourceHash,
      parserVersion: previewSelection.result.preview.parserVersion,
      requestId: globalThis.crypto.randomUUID(),
      mappings,
    })
    if (!parsed.success) {
      setError('Review every task with an explicit L1-L4 mapping before importing.')
      return
    }
    runImport({ command: parsed.data, scope: { ...scope }, unknownObserved: false })
  }

  function retryImport() {
    const command = importCommandRef.current
    if (command) runImport(command, true)
  }

  if (!canManage) return null

  return (
    <section className="card" style={{ marginBottom: 16, padding: 16 }} aria-labelledby="ms-project-xml-import-title" aria-busy={commandBusy || readingFile}>
      <div className="card-header" style={{ paddingInline: 0 }}>
        <div>
          <h2 id="ms-project-xml-import-title" className="card-title">Import MS Project XML</h2>
          <p className="card-subtitle">Review exported XML planning evidence before adding normalized L1–L4 tasks.</p>
        </div>
      </div>
      <p className="form-help">XML exports only; native .mpp files are not accepted. Maximum decoded source size is 1 MiB. Preview is read-only until you explicitly map and confirm every task.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
        <label className="form-label" style={{ minWidth: 0 }}>
          <span>MS Project XML file</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            onChange={handleFileChange}
            disabled={controlsDisabled}
          />
        </label>
        <button
          type="button"
          className="button-secondary"
          onClick={startPreview}
          disabled={!selectedSource || controlsDisabled}
        >
          {previewPhase === 'pending' ? 'Previewing XML…' : 'Preview XML'}
        </button>
      </div>
      {selectedSource && (
        <p className="form-help" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>
          Selected {selectedSource.command.fileName ?? 'XML source'} · {formatBytes(selectedSource.sourceBytes)} · <span style={{ overflowWrap: 'anywhere' }}>source hash {selectedSource.sourceHash}</span>
        </p>
      )}
      {error && (
        <div className="cost-form__error" role="alert" style={{ marginTop: 10 }}>
          <span>{error}</span>
          {importPhase === 'unknown' && (
            <button type="button" className="button-secondary" onClick={retryImport} disabled={!canManage || pending}>
              Retry import
            </button>
          )}
        </div>
      )}
      {notice && <p className="form-help" role="status" style={{ marginTop: 10 }}>{notice}</p>}
      {previewSelection && preview && (
        <div style={{ marginTop: 16 }}>
          <div className="card-header" style={{ paddingInline: 0 }}>
            <div>
              <h3 className="card-title">{preview.projectName || 'Untitled MS Project plan'}</h3>
              <p className="card-subtitle">{tasks.length} validated task{tasks.length === 1 ? '' : 's'} · parser {preview.parserVersion} · {preview.canImport ? 'ready for reviewed mapping' : 'not importable'}</p>
            </div>
          </div>
          {preview.omittedSummaryTask && (
            <p className="form-help">Project summary “{preview.omittedSummaryTask.name}” (UID 0) is excluded from the register.</p>
          )}
          <PreviewIssues preview={preview} />
          <div className="form-help" role="note" style={{ marginTop: 8 }}>
            <strong>Planning-only import.</strong>
            <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
              {preview.disclosures.map((disclosure, index) => <li key={`${disclosure}-${index}`}>{disclosure}</li>)}
            </ul>
          </div>
          <p className="form-help" style={{ marginTop: 8 }}>Imported tasks start <strong>Unassigned</strong>. XML resource assignments are not transferred to ERP owners.</p>
          {outlineDepths.length > 0 && (
            <fieldset style={{ border: 0, margin: '12px 0 0', padding: 0 }}>
              <legend className="form-label">Apply reviewed ERP levels by XML outline depth</legend>
              <p className="form-help" style={{ marginTop: 4 }}>Choose a level to apply it to every task at that depth. Per-task selections below remain available for reviewed exceptions; blank means no level has been inferred.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                {outlineDepths.map((outlineLevel) => (
                  <label key={outlineLevel} className="form-label" style={{ minWidth: 160, flex: '1 1 160px' }}>
                    <span>XML outline depth {outlineLevel}</span>
                    <select
                      className="form-input"
                      aria-label={`Apply target ERP level to outline depth ${outlineLevel}`}
                      value={valueForOutlineDepth(tasks, mappingLevels, outlineLevel)}
                      onChange={(event) => updateOutlineDepth(outlineLevel, event.currentTarget.value)}
                      disabled={controlsDisabled || !preview.canImport || Boolean(committedImport)}
                    >
                      <option value="">Choose target level</option>
                      <option value="l1">L1 · Master</option>
                      <option value="l2">L2 · Phase</option>
                      <option value="l3">L3 · Work package</option>
                      <option value="l4">L4 · Commitment</option>
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="data-table-wrap" tabIndex={0} role="region" aria-label="MS Project XML task evidence" style={{ marginTop: 12, maxHeight: 440, overflow: 'auto' }}>
            <table className="data-table">
              <caption className="sr-only">MS Project XML task evidence and reviewed ERP mapping</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Outline evidence</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Relationship</th>
                  <th scope="col">Reviewed ERP level</th>
                  <th scope="col">Owner</th>
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map((task) => {
                  const mappingValue = mappingLevels[String(task.sourceUid)] ?? ''
                  const mappingId = `ms-project-mapping-${task.sourceUid}`
                  return (
                    <tr key={task.sourceUid}>
                      <td>
                        <strong>UID {task.sourceUid}</strong>
                        <div className="form-help">ID {task.sourceId ?? '—'} · {task.name}</div>
                      </td>
                      <td>
                        <div>Depth {task.outlineLevel}</div>
                        <div className="form-help">{task.outlinePath.join(' › ')}</div>
                        <div className="form-help">{task.outlineNumber ?? 'No outline number'}</div>
                      </td>
                      <td>
                        <div>{task.sourceStart.calendarDate} → {task.sourceFinish.calendarDate}</div>
                        <div className="form-help">{task.sourceStart.raw} → {task.sourceFinish.raw}</div>
                      </td>
                      <td>
                        {task.predecessor ? (
                          <span>UID {task.predecessor.predecessorUid} · {task.predecessor.type}</span>
                        ) : 'None'}
                      </td>
                      <td>
                        <label htmlFor={mappingId} className="sr-only">ERP level for XML task {task.name}</label>
                        <select
                          id={mappingId}
                          className="form-input"
                          value={mappingValue}
                          onChange={(event) => updateMapping(task.sourceUid, event.currentTarget.value)}
                          disabled={controlsDisabled || !canManage || !preview.canImport || Boolean(committedImport)}
                        >
                          <option value="">Choose target level</option>
                          <option value="l1">L1 · Master</option>
                          <option value="l2">L2 · Phase</option>
                          <option value="l3">L3 · Work package</option>
                          <option value="l4">L4 · Commitment</option>
                        </select>
                        <div className="form-help">XML depth {task.outlineLevel} is evidence only</div>
                      </td>
                      <td><span>Unassigned</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {tasks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span className="form-help">Showing {pageStart + 1}–{Math.min(pageStart + REVIEW_PAGE_SIZE, tasks.length)} of {tasks.length} tasks</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="button-secondary" onClick={() => setReviewPage((page) => Math.max(0, page - 1))} disabled={currentPage === 0 || controlsDisabled}>Previous review page</button>
                <span className="form-help">Page {currentPage + 1} of {pageCount}</span>
                <button type="button" className="button-secondary" onClick={() => setReviewPage((page) => Math.min(pageCount - 1, page + 1))} disabled={currentPage >= pageCount - 1 || controlsDisabled}>Next review page</button>
              </div>
            </div>
          )}
          <p className="form-help" style={{ marginTop: 10 }}>{mappedCount} of {tasks.length} tasks mapped</p>
          {mappingRelationshipError && allTasksMapped && (
            <p className="cost-form__error" role="alert" style={{ marginTop: 8 }}>{mappingRelationshipError}</p>
          )}
          <label className="form-label" style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
            <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.currentTarget.checked)} disabled={controlsDisabled || !canManage || !preview.canImport || Boolean(committedImport)} />
            <span>I reviewed every XML task, its dates and relationships, and approve the explicit L1–L4 mapping.</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 12 }}>
            <button type="button" className="button-primary" onClick={startImport} disabled={!preview.canImport || !allTasksMapped || Boolean(mappingRelationshipError) || !reviewConfirmed || controlsDisabled || !canManage || Boolean(committedImport)}>
              {importPhase === 'pending' ? 'Importing XML…' : committedImport ? 'Import committed' : 'Confirm reviewed import'}
            </button>
            {!preview.canImport && <span className="form-help">Resolve preview errors before confirming.</span>}
            {committedImport && <span className="form-help">Receipt verified for {committedImport.receipt.tasks.length} planned task{committedImport.receipt.tasks.length === 1 ? '' : 's'}.</span>}
          </div>
          <p className="form-help" style={{ marginTop: 10 }}>No actuals, progress, resources, calendar rules, costs, or labour minutes are created by this planning import.</p>
        </div>
      )}
    </section>
  )
}
