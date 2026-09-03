'use client'

import { useFormStatus } from 'react-dom'

/** Confirmation is a UX safeguard; the Core service remains the authority. */
export function PlatformSubmitButton({ children, className, confirmation }: {
  children: React.ReactNode
  className?: string
  confirmation?: string
}) {
  const { pending } = useFormStatus()
  return <button
    type="submit"
    className={className}
    disabled={pending}
    aria-busy={pending}
    onClick={(event) => {
      if (confirmation && !window.confirm(confirmation)) event.preventDefault()
    }}
  >{pending ? 'Working…' : children}</button>
}
