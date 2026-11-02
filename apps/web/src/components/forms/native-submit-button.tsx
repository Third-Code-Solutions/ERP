'use client'

import { useEffect, useRef, useState } from 'react'

export function NativeSubmitButton({ children, pendingLabel, className, confirmation }: {
  children: React.ReactNode
  pendingLabel: string
  className?: string
  confirmation?: string
}) {
  const button = useRef<HTMLButtonElement>(null)
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const form = button.current?.form
    if (!form) return
    const submit = (event: SubmitEvent) => {
      if (submitting.current) {
        event.preventDefault()
        return
      }
      if (confirmation && !window.confirm(confirmation)) {
        event.preventDefault()
        return
      }
      submitting.current = true
      setPending(true)
    }
    const restore = () => {
      submitting.current = false
      setPending(false)
    }
    form.addEventListener('submit', submit)
    window.addEventListener('pageshow', restore)
    return () => {
      form.removeEventListener('submit', submit)
      window.removeEventListener('pageshow', restore)
    }
  }, [confirmation])

  return <button ref={button} type="submit" className={className} disabled={pending} aria-busy={pending}>
    {pending ? pendingLabel : children}
  </button>
}
