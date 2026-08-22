'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { retireProject } from '@/app/(dashboard)/projects/[id]/actions'

interface DeleteProjectButtonProps {
  projectId: string
  projectName: string
}

/**
 * A deliberate, accessible confirmation flow for logical project deletion.
 * The server repeats both capability and exact-name checks; this client
 * component only supplies the interaction and recovery state.
 */
export function DeleteProjectButton({
  projectId,
  projectName,
}: DeleteProjectButtonProps) {
  const router = useRouter()
  const headingId = useId()
  const descriptionId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function close(): void {
    if (!isPending) {
      setError(null)
      setIsOpen(false)
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await retireProject(projectId, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push('/projects?notice=project-retired')
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          background: 'white',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          color: '#b91c1c',
          fontWeight: 600,
        }}
      >
        Delete project
      </button>

      {isOpen ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            display: 'grid',
            placeItems: 'center',
            padding: '16px',
            background: 'rgba(15, 23, 42, 0.55)',
          }}
        >
          <form
            aria-describedby={descriptionId}
            aria-labelledby={headingId}
            aria-modal="true"
            onSubmit={submit}
            role="dialog"
            style={{
              width: 'min(100%, 520px)',
              borderRadius: '12px',
              border: '1px solid #fecaca',
              background: 'white',
              padding: '24px',
              boxShadow: '0 20px 48px rgba(15, 23, 42, 0.24)',
            }}
          >
            <h2
              id={headingId}
              style={{
                margin: 0,
                color: 'var(--color-neutral-900)',
                fontSize: '1.125rem',
              }}
            >
              Delete project from operations?
            </h2>
            <p
              id={descriptionId}
              style={{
                margin: '10px 0 18px',
                color: 'var(--color-neutral-600)',
                fontSize: '0.875rem',
                lineHeight: 1.55,
              }}
            >
              This removes <strong>{projectName}</strong> from normal project
              lists. Financial, procurement, drawing, document, and audit
              evidence is retained.
            </p>

            <label style={labelStyle} htmlFor={`${headingId}-reason`}>
              Reason for deletion
            </label>
            <textarea
              required
              id={`${headingId}-reason`}
              minLength={3}
              name="reason"
              rows={3}
              placeholder="For example: duplicate project created during intake"
              style={inputStyle}
            />

            <label
              style={{ ...labelStyle, marginTop: '16px' }}
              htmlFor={`${headingId}-confirmation`}
            >
              Type <strong>{projectName}</strong> to confirm
            </label>
            <input
              required
              autoComplete="off"
              id={`${headingId}-confirmation`}
              name="confirmation"
              style={inputStyle}
            />

            {error ? (
              <p
                role="alert"
                style={{
                  margin: '14px 0 0',
                  color: '#b91c1c',
                  fontSize: '0.8125rem',
                }}
              >
                {error}
              </p>
            ) : null}

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '22px',
              }}
            >
              <button
                type="button"
                disabled={isPending}
                onClick={close}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  ...dangerButtonStyle,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  color: 'var(--color-neutral-700)',
  fontSize: '0.8125rem',
  fontWeight: 600,
}

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  padding: '9px 10px',
  color: 'var(--color-neutral-900)',
  font: 'inherit',
}

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  background: 'white',
  padding: '8px 14px',
  color: 'var(--color-neutral-700)',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 600,
}

const dangerButtonStyle: React.CSSProperties = {
  border: '1px solid #b91c1c',
  borderRadius: '6px',
  background: '#b91c1c',
  padding: '8px 14px',
  color: 'white',
  fontSize: '0.875rem',
  fontWeight: 600,
}
