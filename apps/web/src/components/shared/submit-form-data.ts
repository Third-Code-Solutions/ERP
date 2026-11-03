import type { FormEvent } from 'react'

/**
 * Use as `onSubmit={submitFormData(handler)}` instead of `action={handler}`.
 * React 19 clears uncontrolled fields after a form action, which wipes what
 * the user typed when the server returns an error.
 */
export function submitFormData(handler: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    handler(new FormData(event.currentTarget, submitter))
  }
}
