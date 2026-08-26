'use client'

import { useActionState, useEffect, useRef } from 'react'
import { ORGANIZATION_TYPES } from '@third-code-erp/shared-types'
import { createOrganization } from './actions'
import styles from './owner-console.module.css'

const initialState: {
  message: string
  status: 'error' | 'idle' | 'success'
} = {
  message: '',
  status: 'idle',
}

const ORGANIZATION_LABELS: Record<(typeof ORGANIZATION_TYPES)[number], string> = {
  construction: 'Construction contractor',
  developer: 'Developer or owner',
  'design-engineering': 'Design or engineering firm',
  'supply-manufacturing': 'Supplier or manufacturer',
  'professional-services': 'Professional services',
  other: 'Other project-driven business',
}

export function OrganizationForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, isPending] = useActionState(
    createOrganization,
    initialState
  )

  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset()
  }, [state.status])

  return (
    <form action={formAction} className={styles.organizationForm} ref={formRef}>
      <label>
        Organization name
        <input autoComplete="organization" name="name" required minLength={2} />
      </label>
      <label>
        Workspace slug
        <input
          aria-describedby="organization-slug-help"
          autoCapitalize="none"
          autoComplete="off"
          name="slug"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          placeholder="acme-builders"
          required
        />
        <small id="organization-slug-help">Lowercase letters, numbers, and hyphens only.</small>
      </label>
      <label>
        Organization type
        <select defaultValue="construction" name="organizationType">
          {ORGANIZATION_TYPES.map((type) => (
            <option key={type} value={type}>{ORGANIZATION_LABELS[type]}</option>
          ))}
        </select>
      </label>
      <div className={styles.formActionRow}>
        <button className={styles.primaryButton} disabled={isPending} type="submit">
          {isPending ? 'Creating…' : 'Create organization'}
        </button>
        {state.status !== 'idle' ? (
          <p
            className={state.status === 'success' ? styles.success : styles.error}
            role={state.status === 'error' ? 'alert' : 'status'}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  )
}
