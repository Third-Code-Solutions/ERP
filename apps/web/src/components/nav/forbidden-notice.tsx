'use client'

import React, { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Explains a `?error=forbidden` bounce from a route the user's role cannot open. */
export function ForbiddenNotice() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || searchParams.get('error') !== 'forbidden') return null

  function dismiss() {
    setDismissed(true)
    const next = new URLSearchParams(searchParams.toString())
    next.delete('error')
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <div role="alert" className="access-notice">
      <p>
        You don&apos;t have access to that page with your current role. Ask an administrator if you
        need it.
      </p>
      <button type="button" onClick={dismiss} className="access-notice-dismiss">
        Dismiss
      </button>
    </div>
  )
}
