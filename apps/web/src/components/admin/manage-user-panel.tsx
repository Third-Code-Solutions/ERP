'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ASSIGNABLE_ROLES,
  updateUserRole,
  resetUserPassword,
  deleteUser,
} from '@/app/(dashboard)/admin/users/actions'

interface Props {
  userId: string
  currentRole: string
  email: string
  isSelf: boolean
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin — workspace-wide write',
  owner: 'Owner — legacy super-admin',
  sales: 'Sales',
  commercial: 'Commercial',
  design: 'Design',
  sd_pm_pe: 'SD / PM / PE',
  finance: 'Finance',
  procurement: 'Procurement',
  safety: 'Safety',
  cx: 'Customer Experience',
  viewer: 'Viewer — read-only',
  estimator: 'Estimator (legacy)',
  pm: 'PM (legacy)',
}

export function ManageUserPanel({ userId, currentRole, email, isSelf }: Props) {
  const router = useRouter()
  const [roleError, setRoleError] = useState<string | null>(null)
  const [roleOk, setRoleOk] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdOk, setPwdOk] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleRole(formData: FormData) {
    setRoleError(null)
    setRoleOk(false)
    startTransition(async () => {
      const res = await updateUserRole(formData)
      if (res.error) {
        setRoleError(res.error)
        return
      }
      setRoleOk(true)
      router.refresh()
    })
  }

  function handlePassword(formData: FormData) {
    setPwdError(null)
    setPwdOk(false)
    startTransition(async () => {
      const res = await resetUserPassword(formData)
      if (res.error) {
        setPwdError(res.error)
        return
      }
      setPwdOk(true)
      const form = document.getElementById('reset-pwd-form') as HTMLFormElement | null
      form?.reset()
    })
  }

  function handleDelete(formData: FormData) {
    setDelError(null)
    startTransition(async () => {
      const res = await deleteUser(formData)
      if (res.error) {
        setDelError(res.error)
      }
      // deleteUser redirects on success
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Role */}
      <section>
        <h3 style={sectionHead}>Role</h3>
        <form action={handleRole} style={{ display: 'flex', gap: 8 }}>
          <input type="hidden" name="user_id" value={userId} />
          <select
            name="role"
            defaultValue={currentRole}
            disabled={pending}
            style={{ ...selectStyle, flex: 1 }}
            aria-label="Assign role"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r] ?? r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            style={primaryButton(pending)}
          >
            {pending ? 'Saving…' : 'Save role'}
          </button>
        </form>
        {isSelf && (
          <p style={hint}>
            You cannot demote your own admin role — that would lock you out.
          </p>
        )}
        {roleError && <p style={errorText}>{roleError}</p>}
        {roleOk && <p style={successText}>Role updated.</p>}
      </section>

      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Password reset */}
      <section>
        <h3 style={sectionHead}>Reset password</h3>
        <p style={hint}>
          Set a new password for {email}. The user must change it on next login if
          your org requires.
        </p>
        <form
          id="reset-pwd-form"
          action={handlePassword}
          style={{ display: 'flex', gap: 8 }}
        >
          <input type="hidden" name="user_id" value={userId} />
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            required
            placeholder="At least 12 characters"
            disabled={pending}
            style={{ ...inputStyle, flex: 1 }}
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={pending}
            style={primaryButton(pending)}
          >
            {pending ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
        {pwdError && <p style={errorText}>{pwdError}</p>}
        {pwdOk && <p style={successText}>Password updated.</p>}
      </section>

      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Danger zone */}
      <section>
        <h3 style={{ ...sectionHead, color: 'var(--color-danger)' }}>Danger zone</h3>
        {!showDelete ? (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            disabled={isSelf}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: isSelf ? 'var(--color-neutral-400)' : 'var(--color-danger)',
              border: `1px solid ${
                isSelf ? 'var(--color-border)' : 'color-mix(in oklch, var(--color-danger) 30%, transparent)'
              }`,
              borderRadius: 'var(--radius-md, 6px)',
              fontSize: 13,
              fontWeight: 500,
              cursor: isSelf ? 'not-allowed' : 'pointer',
            }}
            title={isSelf ? 'You cannot delete your own account' : undefined}
          >
            Delete this user
          </button>
        ) : (
          <form action={handleDelete} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input type="hidden" name="user_id" value={userId} />
            <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', margin: 0 }}>
              This removes the auth account and the workspace user row. Audit-logged.
              This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                disabled={pending}
                style={{
                  padding: '8px 14px',
                  background: 'var(--color-danger)',
                  color: 'white',
                  border: 0,
                  borderRadius: 'var(--radius-md, 6px)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: pending ? 'wait' : 'pointer',
                }}
              >
                {pending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md, 6px)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {delError && <p style={errorText}>{delError}</p>}
      </section>
    </div>
  )
}

const sectionHead: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-neutral-900)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inputStyle: React.CSSProperties = {
  height: 38,
  padding: '0 12px',
  background: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md, 6px)',
  fontFamily: 'inherit',
  fontSize: 13.5,
  color: 'var(--color-neutral-900)',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
}

const primaryButton = (pending: boolean): React.CSSProperties => ({
  height: 38,
  padding: '0 14px',
  background: pending ? 'var(--color-neutral-300)' : 'var(--color-navy-700)',
  color: 'white',
  border: 0,
  borderRadius: 'var(--radius-md, 6px)',
  fontSize: 13,
  fontWeight: 600,
  cursor: pending ? 'wait' : 'pointer',
  whiteSpace: 'nowrap',
})

const hint: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 11.5,
  color: 'var(--color-neutral-500)',
  lineHeight: 1.45,
}

const errorText: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  color: 'var(--color-danger)',
}

const successText: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  color: 'var(--color-success)',
}
