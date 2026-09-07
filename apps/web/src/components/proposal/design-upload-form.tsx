'use client'

import React, { useId, useRef, useState, useTransition } from 'react'
import { uploadDesignFile } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

interface DesignDocumentOption {
  id: string
  fileName: string
  createdAt: string
}

interface DesignUploadFormProps {
  opportunityId: string
  documents: DesignDocumentOption[]
  projectId?: string | null
  /** Pass an existing design_file_id to add a new version to it. */
  designFileId?: string
  /** Default file_type if attaching to existing. */
  defaultFileType?: 'initial_layout' | 'final_rendering' | 'animation' | 'revised'
  /** Default name for new file_type creation. */
  defaultName?: string
}

const FILE_TYPE_LABELS: Record<string, string> = {
  initial_layout: 'Initial Layout',
  final_rendering: 'Final Rendering',
  animation: 'Animation',
  revised: 'Revised',
}

export function DesignUploadForm({
  opportunityId,
  documents,
  projectId,
  designFileId,
  defaultFileType = 'initial_layout',
  defaultName = '',
}: DesignUploadFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const fileTypeId = useId()
  const nameId = useId()
  const documentId = useId()
  const notesId = useId()

  function onSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await uploadDesignFile(formData)
      if (res?.error) {
        setError(res.error)
      } else if (res?.version) {
        setSuccess(`Added version ${res.version}.`)
        formRef.current?.reset()
      }
    })
  }

  return (
    <form action={onSubmit} ref={formRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      {designFileId && <input type="hidden" name="design_file_id" value={designFileId} />}

      {!designFileId && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="lbl" htmlFor={fileTypeId}>File type</label>
            <select id={fileTypeId} name="file_type" defaultValue={defaultFileType} className="inp">
              {Object.entries(FILE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="lbl" htmlFor={nameId}>Name</label>
            <input
              id={nameId}
              name="name"
              required
              defaultValue={defaultName}
              placeholder="Ground floor layout"
              className="inp"
            />
          </div>
        </div>
      )}

      {designFileId && (
        <>
          <input type="hidden" name="file_type" value={defaultFileType} />
          <input type="hidden" name="name" value={defaultName || 'Revision'} />
        </>
      )}

      {documents.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="lbl" htmlFor={documentId}>Uploaded document</label>
          <select id={documentId} name="document_id" required defaultValue="" className="inp">
            <option value="" disabled>Select a document</option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.fileName} · {new Date(document.createdAt).toLocaleDateString('en-PH', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div
          role="status"
          style={{
            padding: 10,
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            color: 'var(--color-neutral-600)',
            fontSize: 12.5,
          }}
        >
          No uploaded documents are available for this opportunity.
          {projectId ? (
            <>
              {' '}
              <a href={`/projects/${projectId}/documents`} style={{ color: 'var(--color-navy-700)' }}>
                Upload a document in the project Documents workspace.
              </a>
            </>
          ) : null}
        </div>
      )}

      {projectId && documents.length > 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-600)' }}>
          Need another file?{' '}
          <a href={`/projects/${projectId}/documents`} style={{ color: 'var(--color-navy-700)' }}>
            Open the project Documents workspace.
          </a>
        </p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="lbl" htmlFor={notesId}>Notes</label>
        <textarea id={notesId} name="notes" rows={2} className="inp" placeholder="Changes since previous version…" />
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: 0 }}>{error}</p>}
      {success && <p style={{ color: 'var(--color-success, #15803d)', fontSize: 12, margin: 0 }}>{success}</p>}

      <button
        type="submit"
        disabled={pending || documents.length === 0}
        className="user-chip"
        style={{ alignSelf: 'flex-start', cursor: pending ? 'wait' : 'pointer' }}
      >
        {pending ? 'Adding…' : designFileId ? 'Add new version' : 'Create design file'}
      </button>

      <style>{`
        .lbl { font-size: 12px; font-weight: 500; color: var(--color-neutral-700); }
        .inp {
          font-family: inherit; font-size: 13px; padding: 7px 9px;
          border: 1px solid var(--color-border); border-radius: 4px;
          background: white;
        }
        .inp:focus {
          outline: 0; border-color: var(--color-navy-500);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-navy-500) 18%, transparent);
        }
      `}</style>
    </form>
  )
}
