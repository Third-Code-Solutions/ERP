'use client'

import { useState, type MouseEvent, type ReactNode } from 'react'

const GENERIC_EXPORT_ERROR = 'The export could not be downloaded. Try again.'

/** The export route's JSON error (for example the 50,000-row limit), or a generic message. */
export async function readExportError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string' &&
      body.error
    ) {
      return body.error
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return GENERIC_EXPORT_ERROR
}

function filenameOf(response: Response): string {
  const disposition = response.headers.get('Content-Disposition') ?? ''
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'export.csv'
}

/**
 * A CSV download link that shows the route's refusal (413 over the row limit,
 * 400 bad filters) on the page. A plain `<a download>` shows only "download
 * failed" for a non-2xx answer.
 */
export function ExportCsvLink({
  href,
  className,
  children,
}: {
  href: string
  className: string
  children: ReactNode
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function download(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)
    try {
      const response = await fetch(href, { credentials: 'same-origin' })
      if (!response.ok) {
        setError(await readExportError(response))
        return
      }
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filenameOf(response)
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch {
      setError(GENERIC_EXPORT_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <a
        href={href}
        download
        className={className}
        onClick={download}
        aria-busy={pending || undefined}
      >
        {children}
      </a>
      {error && (
        <p className="finance-form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
