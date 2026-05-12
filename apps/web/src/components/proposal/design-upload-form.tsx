'use client'

import { useRef, useState, useTransition } from 'react'
import { uploadDesignFile } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

interface DesignUploadFormProps {
  opportunityId: string
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
  designFileId,
  defaultFileType = 'initial_layout',
  defaultName = '',
}: DesignUploadFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await uploadDesignFile(formData)
      if (res?.error) {
        setError(res.error)
      } else if (res?.version) {
        setSuccess(`Uploaded version ${res.version}.`)
        formRef.current?.reset()
      }
    })
  }

  return (
    <form action={onSubmit} ref={formRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      {designFileId && <input type="hidden" name="design_file_id" value={designFileId} />}

      {!designFileId && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="lbl">File type</label>
            <select name="file_type" defaultValue={defaultFileType} className="inp">
              {Object.entries(FILE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="lbl">Name</label>
            <input
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="lbl">Document ID (uploaded asset UUID)</label>
        <input
          name="document_id"
          required
          placeholder="00000000-0000-0000-0000-000000000000"
          className="inp"
          style={{ fontFamily: 'var(--font-mono, ui-monospace)' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="lbl">Notes</label>
        <textarea name="notes" rows={2} className="inp" placeholder="Changes since previous version…" />
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: 0 }}>{error}</p>}
      {success && <p style={{ color: 'var(--color-success, #15803d)', fontSize: 12, margin: 0 }}>{success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="user-chip"
        style={{ alignSelf: 'flex-start', cursor: pending ? 'wait' : 'pointer' }}
      >
        {pending ? 'Uploading…' : designFileId ? 'Upload new version' : 'Create design file'}
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
